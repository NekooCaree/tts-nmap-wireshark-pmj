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


def ssh_string(value):
    data = value.encode('ascii')
    return struct.pack('!I', len(data)) + data


def ssh_packet(payload):
    # RFC 4253: packet_length tidak mencakup empat byte panjang itu sendiri.
    padding = 8 - ((len(payload) + 5) % 8)
    if padding < 4:
        padding += 8
    return struct.pack('!IB', 1 + len(payload) + padding, padding) + payload + os.urandom(padding)


def kex_packet():
    # EDU ONLY: daftar algoritme valid, tetapi tidak ada pertukaran kunci/shell.
    names = ['curve25519-sha256,diffie-hellman-group14-sha256',
             'ssh-ed25519,rsa-sha2-256', 'aes128-ctr', 'aes128-ctr',
             'hmac-sha2-256', 'hmac-sha2-256', 'none', 'none', '', '']
    payload = b'\x14' + os.urandom(16) + b''.join(ssh_string(n) for n in names) + b'\x00' + struct.pack('!I', 0)
    return ssh_packet(payload)


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(float(os.environ.get('CLIENT_TIMEOUT', '8')))
        log_connection(self.client_address)
        try:
            self.wfile.write(b'SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5\r\n')
            for _ in range(8):
                banner = self.rfile.readline(513)
                if not banner or len(banner) > 512:
                    return
                if banner.startswith(b'SSH-'):
                    self.wfile.write(kex_packet())
                    # Setelah paket client, hentikan sesi dummy secara protokoler.
                    self.rfile.read(4)
                    self.wfile.write(ssh_packet(b'\x01' + struct.pack('!I', 11) + ssh_string('EDU ONLY: no SSH login') + ssh_string('')))
                    return
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
    port = int(os.environ.get('PORT', '22'))
    with Server(('0.0.0.0', port), Handler) as server:
        print(f'ssh-fake listening on {port}', flush=True)
        server.serve_forever()
