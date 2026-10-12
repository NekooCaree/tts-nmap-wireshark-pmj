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


def handshake(connection_id):
    # Protocol::HandshakeV10 dengan CLIENT_PROTOCOL_41 dan secure auth.
    salt = b'edu12345' + b'dummysalt123'
    capabilities = 0x00088201
    payload = (b'\x0a5.7.38-log\x00' + struct.pack('<I', connection_id)
               + salt[:8] + b'\x00' + struct.pack('<H', capabilities & 0xffff)
               + b'\x21' + struct.pack('<H', 2) + struct.pack('<H', capabilities >> 16)
               + b'\x15' + bytes(10) + salt[8:] + b'\x00mysql_native_password\x00')
    return struct.pack('<I', len(payload))[:3] + b'\x00' + payload


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(float(os.environ.get('CLIENT_TIMEOUT', '8')))
        log_connection(self.client_address)
        try:
            self.wfile.write(handshake(self.client_address[1]))
            header = self.rfile.read(4)
            if len(header) != 4:
                return
            length = int.from_bytes(header[:3], 'little')
            if not 0 < length <= 4096 or len(self.rfile.read(length)) != length:
                return
            # EDU ONLY: auth selalu gagal, tidak ada database atau query SQL.
            payload = b'\xff' + struct.pack('<H', 1045) + b'#28000Access denied (EDU ONLY)'
            self.wfile.write(struct.pack('<I', len(payload))[:3] + bytes([(header[3] + 1) % 256]) + payload)
        except (OSError, ValueError):
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
    port = int(os.environ.get('PORT', '3306'))
    with Server(('0.0.0.0', port), Handler) as server:
        print(f'mysql-fake listening on {port}', flush=True)
        server.serve_forever()
