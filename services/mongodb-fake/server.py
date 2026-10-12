"""Layanan dummy edukatif; bukan implementasi server produksi. EDU ONLY."""
import datetime
import os
import socket
import socketserver
import struct
import threading

def log_connection(address):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{stamp}] Connection from {address[0]}:{address[1]}', flush=True)


def bson(document):
    # Encoder BSON kecil sesuai wire protocol; tanpa pustaka/database MongoDB.
    encoded = []
    for key, value in document.items():
        name = key.encode('utf-8') + b'\x00'
        if isinstance(value, bool):
            encoded.append(b'\x08' + name + bytes([value]))
        elif isinstance(value, str):
            data = value.encode('utf-8') + b'\x00'
            encoded.append(b'\x02' + name + struct.pack('<i', len(data)) + data)
        elif isinstance(value, dict):
            encoded.append(b'\x03' + name + bson(value))
        elif isinstance(value, float):
            encoded.append(b'\x01' + name + struct.pack('<d', value))
        elif isinstance(value, int):
            encoded.append(b'\x10' + name + struct.pack('<i', value))
        else:
            raise ValueError('Unsupported BSON type')
    payload = b''.join(encoded) + b'\x00'
    return struct.pack('<i', len(payload) + 4) + payload


def reply_document(request):
    # Pilihan perintah tetap; tidak menjalankan query, menulis file, atau autentikasi.
    if b'buildInfo\x00' in request or b'buildinfo\x00' in request:
        return {'version': '4.4.18', 'gitVersion': 'edu-only', 'bits': 64, 'ok': 1.0}
    if b'isMaster\x00' in request or b'ismaster\x00' in request or b'hello\x00' in request:
        return {'ismaster': True, 'isWritablePrimary': True, 'helloOk': True,
                'maxBsonObjectSize': 16777216, 'maxMessageSizeBytes': 48000000,
                'minWireVersion': 0, 'maxWireVersion': 9, 'ok': 1.0}
    if b'serverStatus\x00' in request:
        return {'host': 'mongodb.tokoku-lab.local', 'version': '4.4.18', 'process': 'mongod',
                'uptime': 120.0, 'connections': {'current': 1, 'available': 63},
                'mem': {'resident': 16, 'virtual': 64, 'supported': True}, 'ok': 1.0}
    if b'ping\x00' in request:
        return {'ok': 1.0}
    return {'ok': 0.0, 'errmsg': 'EDU ONLY: unsupported command', 'code': 59}


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(float(os.environ.get('CLIENT_TIMEOUT', '8')))
        log_connection(self.client_address)
        try:
            for _ in range(16):
                first = self.rfile.read(4)
                if len(first) != 4:
                    return
                if first in (b'GET ', b'HEAD', b'POST'):
                    body = b'It looks like you are trying to access MongoDB over HTTP on the native driver port.\r\n'
                    self.wfile.write(b'HTTP/1.0 200 OK\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ' + str(len(body)).encode() + b'\r\n\r\n' + body)
                    return
                length = struct.unpack('<i', first)[0]
                if not 16 <= length <= 65536:
                    return
                rest = self.rfile.read(length - 4)
                if len(rest) != length - 4:
                    return
                request_id, _, opcode = struct.unpack('<iii', rest[:12])
                document = bson(reply_document(rest[12:]))
                if opcode == 2004:
                    # OP_QUERY lama dipakai probe Nmap; OP_REPLY terdiri dari 20-byte prefix.
                    body = struct.pack('<iqii', 0, 0, 0, 1) + document
                    response_opcode = 1
                elif opcode == 2013:
                    # OP_MSG modern: flags dan section kind 0 diikuti BSON.
                    body = struct.pack('<i', 0) + b'\x00' + document
                    response_opcode = 2013
                else:
                    return
                self.wfile.write(struct.pack('<iiii', len(body) + 16, 1, request_id, response_opcode) + body)
        except (OSError, ValueError, struct.error):
            pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128

    def __init__(self, address, handler):
        self.slots = threading.BoundedSemaphore(int(os.environ.get('MAX_CONNECTIONS', '64')))
        super().__init__(address, handler)

    def process_request(self, request, address):
        # Thread per koneksi, dengan batas agar scan serentak tidak menghabiskan RAM.
        if self.slots.acquire(blocking=False):
            try:
                super().process_request(request, address)
            except Exception:
                self.slots.release()
                raise
        else:
            self.shutdown_request(request)

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '27017'))
    with Server(('0.0.0.0', port), Handler) as server:
        print(f'mongodb-fake listening on {port}', flush=True)
        server.serve_forever()
