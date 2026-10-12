"""HTTP auth and WebSocket/RFB integration checks, without UI input."""
import base64
import hashlib
import os
from pathlib import Path
import re
import socket
import ssl
import struct
import unittest
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
settings = dict(re.findall(r"^([A-Z_]+)=([^\r\n]*)", (ROOT / ".env").read_text(), re.M))
URL = os.environ.get("DESKTOP_TEST_URL", f'http://127.0.0.1:{settings.get("DESKTOP_PORT", "6080")}')
AUTH = "Basic " + base64.b64encode(
    (settings.get("DESKTOP_USER", "praktikum") + ":" + settings["DESKTOP_PASSWORD"]).encode()).decode()


def request(path, auth=None):
    headers = {"ngrok-skip-browser-warning": "lab-integration-test"}
    if auth:
        headers["Authorization"] = auth
    try:
        response = urllib.request.urlopen(urllib.request.Request(URL + path, headers=headers), timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()


class WebSocket:
    def __init__(self):
        url = urllib.parse.urlsplit(URL)
        sock = socket.create_connection((url.hostname, url.port or (443 if url.scheme == "https" else 80)), 15)
        self.sock = ssl.create_default_context().wrap_socket(sock, server_hostname=url.hostname) if url.scheme == "https" else sock
        self.buffer = bytearray()
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET /websockify HTTP/1.1\r\nHost: {url.netloc}\r\n"
                           f"Authorization: {AUTH}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
                           "Sec-WebSocket-Protocol: binary\r\nngrok-skip-browser-warning: lab-test\r\n\r\n").encode())
        header = bytearray()
        while not header.endswith(b"\r\n\r\n"):
            part = self.sock.recv(1)
            if not part or len(header) > 16384:
                raise AssertionError("WebSocket upgrade header missing")
            header.extend(part)
        expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        assert b" 101 " in header, header.decode(errors="replace")
        assert expected.lower() in header.lower(), "Invalid WebSocket accept value"

    def exact(self, length):
        data = bytearray()
        while len(data) < length:
            part = self.sock.recv(length - len(data))
            if not part:
                raise EOFError("WebSocket closed early")
            data.extend(part)
        return bytes(data)

    def frame(self):
        first, second = self.exact(2)
        size = second & 127
        if size == 126:
            size = struct.unpack("!H", self.exact(2))[0]
        elif size == 127:
            size = struct.unpack("!Q", self.exact(8))[0]
        assert not second & 128, "Server frame unexpectedly masked"
        assert size <= 1024 * 1024, "Frame too large for handshake test"
        payload = self.exact(size)
        assert first & 15 == 2, "Expected binary WebSocket frame"
        return payload

    def rfb_read(self, length):
        while len(self.buffer) < length:
            self.buffer.extend(self.frame())
        data = bytes(self.buffer[:length])
        del self.buffer[:length]
        return data

    def send(self, payload):
        assert len(payload) < 126
        mask = os.urandom(4)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(bytes([0x82, 0x80 | len(payload)]) + mask + masked)

    def close(self):
        self.sock.close()


class DesktopGatewayTests(unittest.TestCase):
    def test_all_entrypoints_require_auth(self):
        for path in ("/", "/vnc.html", "/app/ui.js", "/websockify"):
            with self.subTest(path=path):
                self.assertEqual(request(path)[0], 401)

    def test_wrong_password_rejected(self):
        invalid = "Basic " + base64.b64encode(b"praktikum:invalid-password").decode()
        self.assertEqual(request("/", invalid)[0], 401)

    def test_authorized_pages(self):
        for path, marker in (("/", b"Buka desktop"), ("/vnc.html", b"noVNC")):
            status, body = request(path, AUTH)
            self.assertEqual(status, 200)
            self.assertIn(marker, body)
        self.assertEqual(request("/docs/06-naskah-pengajar.txt", AUTH)[0], 404)

    def test_authenticated_websocket_to_real_vnc(self):
        connection = WebSocket()
        try:
            version = connection.rfb_read(12)
            self.assertEqual(version, b"RFB 003.008\n")
            connection.send(version)
            methods = connection.rfb_read(connection.rfb_read(1)[0])
            self.assertIn(1, methods)
            connection.send(b"\x01")
            self.assertEqual(connection.rfb_read(4), b"\x00" * 4)
            connection.send(b"\x01")  # Shared ClientInit: no keyboard/pointer input.
            init = connection.rfb_read(24)
            width, height = struct.unpack("!HH", init[:4])
            expected = tuple(map(int, settings.get("DESKTOP_RESOLUTION", "1366x768").split("x")))
            self.assertEqual((width, height), expected)
            name_length = struct.unpack("!I", init[20:24])[0]
            self.assertLess(name_length, 4096)
            self.assertTrue(connection.rfb_read(name_length))
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
