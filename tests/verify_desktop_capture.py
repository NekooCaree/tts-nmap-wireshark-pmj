"""Smoke test inside desktop: non-root capture and actual HTTP/DNS/ICMP traffic."""
import http.client
import json
from pathlib import Path
import subprocess
import time

target = "172.31.250.10"
capture = Path("/home/student/lab-files/verifikasi-desktop.pcapng")
with open("/tmp/dumpcap-verification.log", "w") as log:
    process = subprocess.Popen(["/usr/bin/dumpcap", "-q", "-i", "eth0", "-a", "duration:12",
                                "-w", str(capture)], stdout=log, stderr=log)
    time.sleep(1)
    assert process.poll() is None, Path("/tmp/dumpcap-verification.log").read_text()
    subprocess.run(["nmap", "-sT", "-Pn", "-n", "-p", "21,22,23,25,3306,6379,8080,27017", target], check=True)
    connection = http.client.HTTPConnection(target, 8080, timeout=5)
    connection.request("POST", "/api/login", json.dumps({"username": "mahasiswa-demo", "password": "belajar123"}),
                       {"Content-Type": "application/json"})
    response = connection.getresponse()
    assert response.status == 200 and json.loads(response.read())["success"]
    connection.close()
    subprocess.run(["ping", "-c", "2", "-W", "2", target], check=True)
    subprocess.run(["dig", "@" + target, "tokoku.lab"], check=True)
    process.wait(timeout=20)
    assert process.returncode == 0, Path("/tmp/dumpcap-verification.log").read_text()


def count(filter_text):
    result = subprocess.check_output(["tshark", "-r", str(capture), "-Y", filter_text,
                                      "-T", "fields", "-e", "frame.number"], text=True)
    return len(result.splitlines())


checks = {
    "TCP SYN": count("tcp.flags.syn == 1 && tcp.flags.ack == 0"),
    "TCP SYN/ACK": count("tcp.flags.syn == 1 && tcp.flags.ack == 1"),
    "HTTP login POST": count('http.request.method == "POST"'),
    "ICMP echo request": count("icmp.type == 8"),
    "ICMP echo reply": count("icmp.type == 0"),
    "DNS query": count("dns.flags.response == 0 && dns.qry.name == tokoku.lab"),
    "DNS answer": count("dns.flags.response == 1 && dns.a == 172.31.250.10"),
}
assert all(checks.values()), checks
payload = subprocess.check_output(["tshark", "-r", str(capture), "-Y", 'http.request.method == "POST"',
                                   "-T", "fields", "-e", "http.file_data"], text=True)
assert "mahasiswa-demo" in payload and "belajar123" in payload, "Dummy HTTP login body missing"
print("Non-root capture verified:", checks)
print("Capture saved:", capture)
