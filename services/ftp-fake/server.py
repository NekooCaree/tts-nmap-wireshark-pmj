"""Authenticated FTP sandbox for classroom transfers; no operating-system login."""
import errno
import logging
import os
from pathlib import Path

from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.filesystems import AbstractedFS
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_FILES = 100


class LimitedWriter:
    """Delegate normal file behavior while enforcing the upload size before write."""
    def __init__(self, file):
        self.file = file

    def __getattr__(self, name):
        return getattr(self.file, name)

    def write(self, data):
        if self.file.tell() + len(data) > MAX_FILE_BYTES:
            raise OSError(errno.EFBIG, "Maximum upload size is 2 MiB")
        return self.file.write(data)


class LabFilesystem(AbstractedFS):
    def open(self, filename, mode):
        if any(char in mode for char in "wa+"):
            uploads = Path(self.root) / "uploads"
            target = Path(filename).resolve()
            # Flat upload area bounds file count and avoids recursive directory abuse.
            if target.parent != uploads.resolve():
                raise OSError(errno.EACCES, "Upload only to /uploads")
            if not target.exists() and len(list(uploads.iterdir())) >= MAX_FILES:
                raise OSError(errno.ENOSPC, "Upload folder is full; delete an old exercise")
            return LimitedWriter(super().open(filename, mode))
        return super().open(filename, mode)


class LabHandler(FTPHandler):
    # Intentional fixture banner for the Nmap version-detection lesson.
    banner = "(vsFTPd 3.0.3)"
    abstracted_fs = LabFilesystem
    timeout = 120
    auth_failed_timeout = 1
    permit_foreign_addresses = False
    permit_privileged_ports = False

    def ftp_PORT(self, line):
        self.respond("502 Use passive mode (PASV or EPSV).")

    def ftp_EPRT(self, line):
        self.respond("502 Use passive mode (PASV or EPSV).")

    def ftp_REST(self, line):
        self.respond("502 Resume disabled; upload the complete exercise file.")

    def ftp_APPE(self, file):
        self.respond("502 Append disabled; use STOR.")

    def ftp_STOU(self, line):
        self.respond("502 Use STOR with a unique classroom filename.")

    def ftp_RMD(self, path):
        self.respond("550 The classroom directory cannot be removed.")

    def on_incomplete_file_received(self, file):
        # Do not keep partial files after a disconnect or size-limit violation.
        target = Path(file)
        if target.parent.resolve() == (Path(self.fs.root) / "uploads").resolve():
            target.unlink(missing_ok=True)


def create_server(root=None, host=None, port=None, passive_ports=None):
    root = Path(root or os.environ.get("FTP_ROOT", "/data/ftp")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    (root / "uploads").mkdir(exist_ok=True)
    samples = {
        "README.txt": "TOKOKU FTP EDULAB\nFile ini adalah data latihan.\nAkun: mahasiswa (atau akun dari pengajar).\nUpload ke /uploads, maksimum 2 MiB per file, maksimum 100 file.\nDownload, rename, dan delete file latihan melalui FTP.\nTidak ada akses shell, file host, atau kode website.\n",
        "katalog-produk.csv": "id,nama,harga_simulasi\nheadphone,Studio Headphone,349000\nkeyboard,Compact Keyboard,429000\nspeaker,Pocket Speaker,259000\nmouse,Wireless Mouse,159000\n",
    }
    for name, content in samples.items():
        if not (root / name).exists():
            (root / name).write_text(content, encoding="utf-8")
    authorizer = DummyAuthorizer()
    authorizer.add_user(os.environ.get("FTP_USER", "mahasiswa"), os.environ.get("FTP_PASSWORD", "ftpbelajar123"), str(root), perm="elr")
    authorizer.override_perm(os.environ.get("FTP_USER", "mahasiswa"), str(root / "uploads"), perm="elrdfw", recursive=False)
    class ConfiguredHandler(LabHandler):
        pass
    ConfiguredHandler.authorizer = authorizer
    ConfiguredHandler.passive_ports = range(30000, 30010) if passive_ports is None else passive_ports
    ConfiguredHandler.masquerade_address = os.environ.get("FTP_PASV_ADDRESS", "127.0.0.1")
    server = FTPServer((host or os.environ.get("FTP_BIND", "0.0.0.0"), int(port if port is not None else os.environ.get("FTP_LISTEN_PORT", "21"))), ConfiguredHandler)
    server.max_cons = int(os.environ.get("MAX_CONNECTIONS", "64"))
    server.max_cons_per_ip = server.max_cons
    return server


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    server = create_server()
    try:
        server.serve_forever()
    finally:
        server.close_all()

