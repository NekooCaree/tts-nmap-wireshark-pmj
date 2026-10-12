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
            self.wfile.write(b'220 mail.tokoku-lab.local ESMTP Postfix\r\n')
            for _ in range(32):
                line = self.rfile.readline(4097)
                if not line or len(line) > 4096:
                    break
                verb = line.strip().split(b' ', 1)[0].upper()
                if verb == b'EHLO':
                    reply = b'250-mail.tokoku-lab.local\r\n250-PIPELINING\r\n250 8BITMIME\r\n'
                elif verb == b'HELO':
                    reply = b'250 mail.tokoku-lab.local\r\n'
                elif verb == b'QUIT':
                    self.wfile.write(b'221 Bye\r\n')
                    break
                elif verb in (b'NOOP', b'RSET'):
                    reply = b'250 Ok\r\n'
                elif verb in (b'MAIL', b'RCPT', b'DATA'):
                    # EDU ONLY: tidak pernah menjadi relay atau mengirim email.
                    reply = b'550 EDU ONLY: mail delivery disabled\r\n'
                else:
                    reply = b'502 Command not implemented\r\n'
                self.wfile.write(reply)
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
    port = int(os.environ.get('PORT', '25'))
    with Server(('0.0.0.0', port), Handler) as server:
        print(f'smtp-fake listening on {port}', flush=True)
        server.serve_forever()
