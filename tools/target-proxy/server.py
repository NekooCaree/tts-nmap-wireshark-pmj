"""Bounded TCP relays: eight lab services behind one private classroom IP."""
import select
import socket
import struct
import threading
import time

TARGETS = {
    21: "ftp-fake", 22: "ssh-fake", 23: "telnet-fake", 25: "smtp-fake",
    3306: "mysql-fake", 6379: "redis-fake", 8080: "web-toko", 27017: "mongodb-fake",
}
# FTP passive data connections must traverse the same relay as the control channel.
TARGETS.update({port: "ftp-fake" for port in range(30000, 30010)})
SLOTS = threading.BoundedSemaphore(64)
MAX_BUFFER = 256 * 1024


def relay(client, host, port):
    backend = None
    try:
        backend = socket.create_connection((host, port), timeout=5)
        peers = {client: backend, backend: client}
        buffers = {client: bytearray(), backend: bytearray()}
        read_open = {client: True, backend: True}
        write_closed = set()
        for sock in peers:
            sock.setblocking(False)
        last_activity = time.monotonic()
        while time.monotonic() - last_activity < 60:
            readable, writable, _ = select.select(
                [s for s in peers if read_open[s]],
                [s for s in peers if buffers[s]], [], 1)
            for sock in readable:
                data = sock.recv(65536)
                if data:
                    buffers[peers[sock]].extend(data)
                    if len(buffers[peers[sock]]) > MAX_BUFFER:
                        return
                    last_activity = time.monotonic()
                else:
                    read_open[sock] = False
            for sock in writable:
                sent = sock.send(buffers[sock])
                del buffers[sock][:sent]
                last_activity = time.monotonic()
            for sock in peers:
                if not read_open[peers[sock]] and not buffers[sock] and sock not in write_closed:
                    sock.shutdown(socket.SHUT_WR)
                    write_closed.add(sock)
            if not any(read_open.values()) and not any(buffers.values()):
                return
    except (OSError, ValueError):
        pass
    finally:
        client.close()
        if backend:
            backend.close()
        SLOTS.release()


def listen(port, host):
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", port))
    server.listen(64)
    print(f"Lab relay :{port} -> {host}:{port}", flush=True)
    while True:
        client, _ = server.accept()
        if SLOTS.acquire(blocking=False):
            threading.Thread(target=relay, args=(client, host, port), daemon=True).start()
        else:
            client.close()


def dns_lab():
    """DNS A records for two fixture names; no recursive resolver or forwarding."""
    server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server.bind(("0.0.0.0", 53))
    while True:
        packet, client = server.recvfrom(512)
        try:
            if len(packet) < 17:
                continue
            transaction, flags, questions, _, _, _ = struct.unpack("!6H", packet[:12])
            if flags & 0x8000 or questions != 1:
                continue
            offset, labels = 12, []
            while packet[offset]:
                length = packet[offset]
                if length > 63 or offset + 1 + length >= len(packet):
                    raise ValueError("Invalid DNS label")
                labels.append(packet[offset + 1:offset + 1 + length].decode("ascii"))
                offset += 1 + length
            offset += 1
            qtype, qclass = struct.unpack("!HH", packet[offset:offset + 4])
            question = packet[12:offset + 4]
            found = ".".join(labels).lower() in {"target.lab", "tokoku.lab"}
            answer = b""
            if found and qtype == 1 and qclass == 1:
                answer = b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 60, 4) + socket.inet_aton("172.31.250.10")
            reply_flags = 0x8400 | (flags & 0x0100) | (0 if found else 3)
            server.sendto(struct.pack("!6H", transaction, reply_flags, 1, int(bool(answer)), 0, 0)
                          + question + answer, client)
        except (ValueError, IndexError, UnicodeError, struct.error, OSError):
            continue


threading.Thread(target=dns_lab, daemon=True).start()
for port, host in TARGETS.items():
    threading.Thread(target=listen, args=(port, host), daemon=True).start()
threading.Event().wait()
