"""Run inside desktop: DNS fixtures and TCP relay response/half-close integrity."""
import http.client
import json
import os
import socket
import struct
import unittest

TARGET = os.environ.get("LAB_TEST_HOST", "172.31.250.10")


def query(name, qtype=1):
    labels = b"".join(bytes([len(part)]) + part.encode() for part in name.split(".")) + b"\x00"
    packet = struct.pack("!6H", 0x1234, 0x0100, 1, 0, 0, 0) + labels + struct.pack("!HH", qtype, 1)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(2)
        sock.sendto(packet, (TARGET, 53))
        reply, sender = sock.recvfrom(512)
        assert sender[0] == TARGET
        return reply


class DesktopNetworkTests(unittest.TestCase):
    def test_dns_a_fixtures(self):
        for name in ("target.lab", "tokoku.lab", "TOKOKU.lab"):
            with self.subTest(name=name):
                reply = query(name)
                transaction, flags, questions, answers, _, _ = struct.unpack("!6H", reply[:12])
                self.assertEqual(transaction, 0x1234)
                self.assertEqual(flags & 15, 0)
                self.assertEqual((questions, answers), (1, 1))
                self.assertEqual(reply[-4:], socket.inet_aton(TARGET))

    def test_dns_external_name_is_nxdomain(self):
        header = struct.unpack("!6H", query("example.com")[:12])
        self.assertEqual(header[1] & 15, 3)
        self.assertEqual(header[3], 0)

    def test_dns_aaaa_is_nodata(self):
        header = struct.unpack("!6H", query("tokoku.lab", 28)[:12])
        self.assertEqual(header[1] & 15, 0)
        self.assertEqual(header[3], 0)

    def test_malformed_dns_does_not_stop_server(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            for packet in (b"short", b"\x00" * 12, struct.pack("!6H", 1, 0x100, 1, 0, 0, 0) + b"\xff\xffbad"):
                sock.sendto(packet, (TARGET, 53))
        self.assertEqual(struct.unpack("!6H", query("target.lab")[:12])[3], 1)

    def test_http_close_keeps_complete_response(self):
        for _ in range(30):
            connection = http.client.HTTPConnection(TARGET, 8080, timeout=5)
            try:
                connection.request("GET", "/api/products", headers={"Connection": "close"})
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(len(json.loads(response.read())), 4)
            finally:
                connection.close()

    def test_tcp_half_close_keeps_server_reply(self):
        with socket.create_connection((TARGET, 8080), 5) as sock:
            sock.sendall(b"GET /api/health HTTP/1.1\r\nHost: target.lab\r\nConnection: close\r\n\r\n")
            sock.shutdown(socket.SHUT_WR)
            reply = bytearray()
            while True:
                data = sock.recv(4096)
                if not data:
                    break
                reply.extend(data)
            self.assertIn(b"200 OK", reply)
            self.assertIn(b'"status":"ok"', reply)


if __name__ == "__main__":
    unittest.main(verbosity=2)
