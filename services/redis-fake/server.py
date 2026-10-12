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


def read_command(reader):
    line = reader.readline(4097)
    if not line:
        return None
    if len(line) > 4096 or not line.endswith(b'\n'):
        raise ValueError('Command too long')
    if not line.startswith(b'*'):
        return line.strip().split()
    # RESP array: PING dan INFO dapat datang sebagai inline atau bulk strings.
    count = int(line[1:])
    if not 1 <= count <= 16:
        raise ValueError('Invalid array')
    parts = []
    for _ in range(count):
        size_line = reader.readline(64)
        if not size_line.startswith(b'$'):
            raise ValueError('Expected bulk string')
        size = int(size_line[1:])
        if not 0 <= size <= 4096:
            raise ValueError('Invalid bulk length')
        data = reader.read(size)
        if len(data) != size or reader.read(2) != b'\r\n':
            raise ValueError('Truncated bulk')
        parts.append(data)
    return parts


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(float(os.environ.get('CLIENT_TIMEOUT', '8')))
        log_connection(self.client_address)
        try:
            for _ in range(32):
                parts = read_command(self.rfile)
                if parts is None:
                    break
                verb = parts[0].upper() if parts else b''
                if verb == b'PING':
                    reply = b'+PONG\r\n'
                elif verb == b'INFO':
                    # EDU ONLY: statistik/version sintetis, tidak menyimpan data.
                    info = (b'# Server\r\nredis_version:6.2.6\r\nredis_mode:standalone\r\n'
                            b'os:Linux EduLab\r\narch_bits:64\r\ntcp_port:6379\r\nuptime_in_seconds:120\r\n'
                            b'# Clients\r\nconnected_clients:1\r\n# Memory\r\nused_memory:1024\r\n'
                            b'# Replication\r\nrole:master\r\nconnected_slaves:0\r\n')
                    reply = b'$' + str(len(info)).encode() + b'\r\n' + info + b'\r\n'
                else:
                    reply = b'-ERR unknown command\r\n'
                self.wfile.write(reply)
        except (OSError, ValueError, OverflowError):
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
    port = int(os.environ.get('PORT', '6379'))
    with Server(('0.0.0.0', port), Handler) as server:
        print(f'redis-fake listening on {port}', flush=True)
        server.serve_forever()
