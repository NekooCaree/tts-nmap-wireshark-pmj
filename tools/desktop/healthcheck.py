import socket
import subprocess
import urllib.request

subprocess.run(["xdpyinfo"], check=True, stdout=subprocess.DEVNULL,
               stderr=subprocess.DEVNULL, timeout=2)
with socket.create_connection(("127.0.0.1", 5900), 2) as connection:
    assert connection.recv(12).startswith(b"RFB ")
with urllib.request.urlopen("http://127.0.0.1:6080/vnc.html", timeout=2) as response:
    assert response.status == 200
