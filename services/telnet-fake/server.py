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


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(float(os.environ.get('CLIENT_TIMEOUT', '8')))
        log_connection(self.client_address)
        try:
            # EDU ONLY: banner OS palsu; negosiasi terminal seperti Linux telnetd.
            # DO TERMINAL-TYPE, TERMINAL-SPEED, X-DISPLAY-LOCATION, NEW-ENVIRON.
            self.wfile.write(b'Ubuntu 20.04 LTS\r\nlogin: \xff\xfd\x18\xff\xfd\x20\xff\xfd\x23\xff\xfd\x27')
            for _ in range(3):
                line = self.rfile.readline(1025)
                if not line or len(line) > 1024:
                    return
                self.wfile.write(b'Password: ')
                password = self.rfile.readline(1025)
                if not password or len(password) > 1024:
                    return
                self.wfile.write(b'Login incorrect\r\nlogin: ')
        except OSError:
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
    port = int(os.environ.get('PORT', '23'))
    with Server(('0.0.0.0', port), Handler) as server:
        print(f'telnet-fake listening on {port}', flush=True)
        server.serve_forever()
