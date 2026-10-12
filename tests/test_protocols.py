"""Integration tests ke lab lokal yang sudah berjalan. Hanya data dummy."""
import concurrent.futures
import http.client as http_client
import json
import os
import socket
import struct
import uuid
import unittest

HOST = os.environ.get('LAB_TEST_HOST', '127.0.0.1')
WEB_PORT = int(os.environ.get('WEB_PORT', '8080'))


def connect(port):
    connection = socket.create_connection((HOST, port), timeout=3)
    connection.settimeout(3)
    return connection


def exact(connection, size):
    data = b''
    while len(data) < size:
        part = connection.recv(size - len(data))
        if not part:
            raise EOFError('Paket terpotong')
        data += part
    return data


def http(method, url, data=None, raw=None, cookie=None):
    connection = http_client.HTTPConnection(HOST, WEB_PORT, timeout=10)
    try:
        body = raw if raw is not None else json.dumps(data) if data is not None else None
        headers = {'Content-Type': 'application/json'} if body is not None else {}
        if cookie:
            headers['Cookie'] = cookie
        connection.request(method, url, body=body, headers=headers)
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


def mongo_request(command, opcode=2004):
    element = b'\x01' + command.encode() + b'\x00' + struct.pack('<d', 1.0)
    document = struct.pack('<i', len(element) + 5) + element + b'\x00'
    if opcode == 2004:
        body = struct.pack('<i', 0) + b'admin.$cmd\x00' + struct.pack('<ii', 0, -1) + document
    else:
        body = struct.pack('<i', 0) + b'\x00' + document
    return struct.pack('<iiii', len(body) + 16, 12345, 0, opcode) + body


class ProtocolTests(unittest.TestCase):
    def test_ftp_login_rejected(self):
        with connect(21) as connection, connection.makefile('rb') as reader:
            self.assertEqual(reader.readline(), b'220 (vsFTPd 3.0.3)\r\n')
            connection.sendall(b'USER anonymous\r\n')
            self.assertTrue(reader.readline().startswith(b'331 '))
            connection.sendall(b'PASS demo@example.com\r\n')
            self.assertTrue(reader.readline().startswith(b'530 '))
            connection.sendall(b'QUIT\r\n')
            self.assertEqual(reader.readline(), b'221 Goodbye.\r\n')

    def test_smtp_ehlo(self):
        with connect(25) as connection, connection.makefile('rb') as reader:
            self.assertEqual(reader.readline(), b'220 mail.tokoku-lab.local ESMTP Postfix\r\n')
            connection.sendall(b'EHLO mahasiswa.local\r\n')
            self.assertEqual([reader.readline() for _ in range(3)], [b'250-mail.tokoku-lab.local\r\n', b'250-PIPELINING\r\n', b'250 8BITMIME\r\n'])
            connection.sendall(b'MAIL FROM:<demo@example.com>\r\n')
            self.assertTrue(reader.readline().startswith(b'550'))
            connection.sendall(b'QUIT\r\n')
            self.assertEqual(reader.readline(), b'221 Bye\r\n')

    def test_ssh_banner_and_kex_packet(self):
        with connect(22) as connection, connection.makefile('rb') as reader:
            self.assertEqual(reader.readline(), b'SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5\r\n')
            connection.sendall(b'SSH-2.0-EduTest\r\n')
            size = struct.unpack('!I', reader.read(4))[0]
            packet = reader.read(size)
            self.assertEqual((size + 4) % 8, 0)
            self.assertGreaterEqual(packet[0], 4)
            self.assertEqual(packet[1], 20)  # SSH_MSG_KEXINIT
            self.assertIn(b'curve25519-sha256', packet)
            self.assertIn(b'ssh-ed25519', packet)

    def test_mysql_handshake_and_denial(self):
        with connect(3306) as connection:
            header = exact(connection, 4)
            self.assertEqual(header[3], 0)
            payload = exact(connection, int.from_bytes(header[:3], 'little'))
            self.assertEqual(payload[0], 10)
            self.assertEqual(payload[1:].split(b'\x00', 1)[0], b'5.7.38-log')
            self.assertTrue(payload.endswith(b'mysql_native_password\x00'))
            connection.sendall(b'\x01\x00\x00\x01\x00')
            rejection = exact(connection, 4)
            self.assertEqual(rejection[3], 2)
            self.assertTrue(exact(connection, int.from_bytes(rejection[:3], 'little')).startswith(b'\xff'))

    def test_redis_inline_and_pipeline(self):
        with connect(6379) as connection, connection.makefile('rb') as reader:
            connection.sendall(b'PING\r\nSET secret dummy\r\nPING\r\n')
            self.assertEqual(reader.readline(), b'+PONG\r\n')
            self.assertEqual(reader.readline(), b'-ERR unknown command\r\n')
            self.assertEqual(reader.readline(), b'+PONG\r\n')

    def test_redis_resp_info_length(self):
        with connect(6379) as connection, connection.makefile('rb') as reader:
            connection.sendall(b'*1\r\n$4\r\nINFO\r\n')
            size = int(reader.readline()[1:])
            info = reader.read(size)
            self.assertIn(b'redis_version:6.2.6\r\n', info)
            self.assertEqual(reader.read(2), b'\r\n')

    def test_telnet_prompts(self):
        with connect(23) as connection:
            banner = exact(connection, len(b'Ubuntu 20.04 LTS\r\nlogin: ') + 12)
            self.assertTrue(banner.startswith(b'Ubuntu 20.04 LTS\r\nlogin: '))
            connection.sendall(b'mahasiswa\r\n')
            self.assertEqual(exact(connection, 10), b'Password: ')
            connection.sendall(b'dummy\r\n')
            self.assertEqual(exact(connection, 24), b'Login incorrect\r\nlogin: ')

    def test_mongodb_legacy_and_modern(self):
        for opcode, command in [(2004, 'serverStatus'), (2004, 'buildInfo'), (2013, 'hello')]:
            with self.subTest(opcode=opcode, command=command), connect(27017) as connection:
                request = mongo_request(command, opcode)
                # EDU: sengaja pecah header/body untuk memeriksa framing TCP.
                connection.sendall(request[:9]); connection.sendall(request[9:])
                length, _, response_to, response_opcode = struct.unpack('<iiii', exact(connection, 16))
                self.assertEqual(response_to, 12345)
                self.assertEqual(response_opcode, 1 if opcode == 2004 else 2013)
                body = exact(connection, length - 16)
                document = body[20:] if opcode == 2004 else body[5:]
                self.assertEqual(struct.unpack('<i', document[:4])[0], len(document))
                self.assertEqual(document[-1], 0)
                if command != 'hello': self.assertIn(b'4.4.18\x00', document)
                else: self.assertIn(b'helloOk\x00\x01', document)

    def test_mongodb_multiple_messages(self):
        with connect(27017) as connection:
            for command in ['serverStatus', 'buildInfo']:
                connection.sendall(mongo_request(command))
                length = struct.unpack('<iiii', exact(connection, 16))[0]
                self.assertIn(b'4.4.18', exact(connection, length - 16))

    def test_malformed_lengths_close_cleanly(self):
        for port, data in [(27017, struct.pack('<i', 1000000)), (6379, b'*99999\r\n')]:
            with self.subTest(port=port), connect(port) as connection:
                connection.sendall(data)
                self.assertEqual(connection.recv(32), b'')

    def test_concurrent_ftp_clients(self):
        def grab(_):
            with connect(21) as connection, connection.makefile('rb') as reader:
                return reader.readline()
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
            results = list(executor.map(grab, range(32)))
        self.assertTrue(all(item == b'220 (vsFTPd 3.0.3)\r\n' for item in results))

    def test_http_health_headers_and_products(self):
        status, headers, body = http('GET', '/api/health')
        self.assertEqual(status, 200)
        self.assertEqual(headers['Server'], 'TokoKu/1.0 (EduLab)')
        self.assertNotIn('X-Powered-By', headers)
        self.assertTrue(json.loads(body)['eduOnly'])
        self.assertEqual(len(json.loads(http('GET', '/api/products')[2])), 4)

    def test_http_login_body(self):
        status, headers, body = http('POST', '/api/login', {'username': 'mahasiswa-demo', 'password': 'belajar123'})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['username'], 'mahasiswa-demo')
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertEqual(http('POST', '/api/login', {'username': 'mahasiswa-demo', 'password': 'wrong'})[0], 401)
        self.assertEqual(http('POST', '/api/login', {'username': [], 'password': 'dummy'})[0], 400)

    def test_checkout_dummy_only_and_server_total(self):
        status, headers, _ = http('POST', '/api/register', {'username': 'test-' + uuid.uuid4().hex[:12], 'password': 'testpass123', 'fullname': 'Tes integrasi'})
        self.assertEqual(status, 201)
        cookie = headers['Set-Cookie'].split(';')[0]
        self.assertEqual(http('POST', '/api/cart/items', {'id': 'headphone', 'quantity': 2}, cookie=cookie)[0], 200)
        data = {'fullname': 'Mahasiswa Contoh', 'address': 'Jl. Praktikum No. 1', 'card_number': '4111 1111 1111 1111', 'expiry': '12/30', 'cvv': '123', 'items': [{'id': 'headphone', 'quantity': 2}], 'total': 1}
        status, _, body = http('POST', '/api/checkout', data, cookie=cookie)
        self.assertEqual(status, 201)
        self.assertEqual(json.loads(body)['total'], 698000)
        order_id = json.loads(body)['orderId']
        self.assertEqual(http('POST', '/api/orders/' + order_id + '/cancel', {}, cookie=cookie)[0], 200)
        data['card_number'] = '5555555555554444'
        self.assertEqual(http('POST', '/api/checkout', data, cookie=cookie)[0], 400)
        self.assertEqual(http('POST', '/api/cart/items', {'id': 'headphone', 'quantity': -1}, cookie=cookie)[0], 400)

    def test_http_bad_body(self):
        self.assertEqual(http('POST', '/api/login', raw='{bad-json')[0], 400)
        self.assertEqual(http('POST', '/api/login', raw='"' + 'x' * 40000 + '"')[0], 413)

    def test_http_diagnostic_target_restrictions(self):
        for url in ['/api/dns-lookup?host=localhost', '/api/dns-lookup?host=169.254.169.254', '/api/ping?host=8.8.8.8%3Bwhoami', '/api/ping?host=127.0.0.1']:
            self.assertEqual(http('GET', url)[0], 400)

    def test_http_pages_and_teacher_docs_not_served(self):
        for url in ['/', '/login.html', '/checkout.html', '/lab.html']:
            status, _, body = http('GET', url)
            self.assertEqual(status, 200)
            self.assertIn(b'<html lang="id">', body)
        self.assertEqual(http('GET', '/docs/03-answer-key.md')[0], 404)


if __name__ == '__main__':
    unittest.main()
