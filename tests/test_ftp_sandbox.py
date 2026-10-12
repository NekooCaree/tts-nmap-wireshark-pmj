"""Isolated local FTP tests; no Docker, ngrok, Nmap, or existing lab service is touched."""
import ftplib
import importlib.util
import io
import logging
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("lab_ftp", ROOT / "services/ftp-fake/server.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class FTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        logging.basicConfig(level=logging.CRITICAL)
        cls.temp = tempfile.TemporaryDirectory(prefix="tokoku-ftp-test-")
        cls.root = Path(cls.temp.name)
        cls.previous_env = {key: os.environ.get(key) for key in ["FTP_USER", "FTP_PASSWORD", "FTP_PASV_ADDRESS"]}
        os.environ.update(FTP_USER="mahasiswa", FTP_PASSWORD="ftpbelajar123", FTP_PASV_ADDRESS="127.0.0.1")
        cls.server = lab.create_server(cls.root, "127.0.0.1", 0, passive_ports=[0])
        cls.port = cls.server.socket.getsockname()[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, kwargs={"timeout": 0.05, "handle_exit": False}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.close_all()
        cls.thread.join(timeout=3)
        cls.temp.cleanup()
        for key, value in cls.previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def connect(self, login=True):
        ftp = ftplib.FTP()
        ftp.connect("127.0.0.1", self.port, timeout=6)
        if login:
            ftp.login("mahasiswa", "ftpbelajar123")
        self.addCleanup(ftp.close)
        return ftp

    def test_login_download_upload_rename_delete(self):
        ftp = self.connect()
        self.assertIn("vsFTPd 3.0.3", ftp.getwelcome())
        self.assertIn("README.txt", ftp.nlst())
        content = io.BytesIO()
        ftp.retrbinary("RETR README.txt", content.write)
        self.assertIn(b"TOKOKU FTP EDULAB", content.getvalue())
        payload = b"Mahasiswa A\nData praktikum bukan rahasia.\n"
        ftp.storbinary("STOR uploads/student-a.txt", io.BytesIO(payload))
        ftp.rename("uploads/student-a.txt", "uploads/student-a-renamed.txt")
        received = io.BytesIO()
        ftp.retrbinary("RETR uploads/student-a-renamed.txt", received.write)
        self.assertEqual(payload, received.getvalue())
        self.assertEqual((self.root / "uploads/student-a-renamed.txt").read_bytes(), payload)
        ftp.delete("uploads/student-a-renamed.txt")
        self.assertFalse((self.root / "uploads/student-a-renamed.txt").exists())

    def test_wrong_password_and_anonymous_rejected(self):
        for username, password in [("mahasiswa", "wrong"), ("anonymous", "demo@example.com")]:
            ftp = self.connect(False)
            with self.assertRaises(ftplib.error_perm):
                ftp.login(username, password)

    def test_readonly_samples_and_path_escape(self):
        ftp = self.connect()
        for name in ["README.txt", "../outside.txt", "uploads/../../outside.txt"]:
            with self.subTest(name=name), self.assertRaises(ftplib.error_perm):
                ftp.storbinary("STOR " + name, io.BytesIO(b"not permitted"))
        with self.assertRaises(ftplib.error_perm):
            ftp.delete("README.txt")
        with self.assertRaises(ftplib.error_perm):
            ftp.retrbinary("RETR /etc/passwd", lambda _: None)
        with self.assertRaises(ftplib.error_perm):
            ftp.rmd("uploads")

    def test_passive_epsv_and_no_active_bounce(self):
        ftp = self.connect()
        self.assertTrue(ftp.sendcmd("EPSV").startswith("229"))
        self.assertTrue(ftp.sendcmd("PASV").startswith("227"))
        for command in ["PORT 127,0,0,1,0,22", "EPRT |1|127.0.0.1|22|", "REST 1", "STOU"]:
            with self.subTest(command=command), self.assertRaises(ftplib.error_perm):
                ftp.sendcmd(command)

    def test_oversized_upload_is_rejected_and_partial_removed(self):
        ftp = self.connect()
        with self.assertRaises((ftplib.error_temp, ftplib.error_perm, OSError)):
            ftp.storbinary("STOR uploads/oversized.bin", io.BytesIO(b"x" * (lab.MAX_FILE_BYTES + 65536)))
        # Wait for the control-channel response/callback if the data socket closed first.
        try:
            ftp.voidcmd("NOOP")
        except (ftplib.all_errors):
            pass
        deadline = time.monotonic() + 1
        while (self.root / "uploads/oversized.bin").exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertFalse((self.root / "uploads/oversized.bin").exists())

    def test_upload_folder_capacity(self):
        for i in range(lab.MAX_FILES):
            (self.root / "uploads" / ("capacity-%d.txt" % i)).write_bytes(b"x")
        try:
            ftp = self.connect()
            with self.assertRaises(ftplib.error_perm):
                ftp.storbinary("STOR uploads/extra.txt", io.BytesIO(b"x"))
        finally:
            for item in (self.root / "uploads").glob("capacity-*.txt"):
                item.unlink()


if __name__ == "__main__":
    unittest.main()

