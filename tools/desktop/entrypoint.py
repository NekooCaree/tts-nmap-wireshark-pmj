import os
import re
import shutil
import signal
import subprocess
import time

children = []
running = True


def launch(*command):
    process = subprocess.Popen(command, start_new_session=True)
    children.append(process)
    return process


def stop(*_):
    global running
    running = False


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
resolution = os.environ.get("DESKTOP_RESOLUTION", "1366x768")
if not re.fullmatch(r"\d{3,4}x\d{3,4}", resolution):
    raise SystemExit("DESKTOP_RESOLUTION must be e.g. 1366x768")
os.makedirs("/tmp/runtime-student", mode=0o700, exist_ok=True)
os.environ["XDG_RUNTIME_DIR"] = "/tmp/runtime-student"
shutil.copyfile("/opt/desktop/welcome.txt", "/home/student/lab-files/PETUNJUK.txt")
try:
    xvfb = launch("Xvfb", ":1", "-screen", "0", resolution + "x24", "-nolisten", "tcp")
    for attempt in range(60):
        if not running or xvfb.poll() is not None:
            raise RuntimeError("Xvfb stopped")
        if subprocess.run(["xdpyinfo"], stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError("Xvfb did not become ready")
    wm = launch("dbus-run-session", "--", "openbox-session")
    vnc = launch("x11vnc", "-display", ":1", "-localhost", "-rfbport", "5900",
                 "-forever", "-shared", "-nopw", "-noxdamage", "-quiet")
    ws = launch("websockify", "--web", "/usr/share/novnc", "6080", "127.0.0.1:5900")
    time.sleep(1)
    launch("tint2")
    launch("xterm", "-title", "Praktikum - Terminal", "-fa", "DejaVu Sans Mono", "-fs", "11",
           "-geometry", "100x28+30+30", "-e", "bash", "-c",
           "cat /opt/desktop/welcome.txt; exec bash")
    while running:
        if any(process.poll() is not None for process in (xvfb, wm, vnc, ws)):
            raise RuntimeError("An essential desktop process stopped")
        time.sleep(0.5)
finally:
    for process in reversed(children):
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for process in children:
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
