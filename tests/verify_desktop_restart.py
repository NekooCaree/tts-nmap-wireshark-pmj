"""Opt-in restart regression: removes temporary X11 state, preserves lab files.

Run on the Docker host: python tests/verify_desktop_restart.py --allow-restart
This briefly interrupts the shared desktop. Do not run during student captures.
"""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--allow-restart', action='store_true')
args = parser.parse_args()
if not args.allow_restart:
    parser.error('Use --allow-restart when the shared desktop is free for testing')

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = 'nmap-fake-services-lab-lab-desktop-1'
MARKER = 'restart-check-' + uuid.uuid4().hex


def docker(*arguments):
    return subprocess.check_output(['docker', *arguments], cwd=ROOT, text=True).strip()


def info():
    return json.loads(docker('inspect', CONTAINER))[0]


def wait_healthy():
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        state = info()['State']
        if not state['Running']:
            raise AssertionError('Desktop exited: ' + docker('logs', '--tail', '25', CONTAINER))
        if state.get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(1)
    raise AssertionError('Desktop healthcheck did not become ready')


def execute(code):
    return docker('exec', CONTAINER, 'python3', '-c', code)


initial = info()
initial_id = initial['Id']
assert initial['State'].get('Health', {}).get('Status') == 'healthy', 'Start desktop before testing'
assert '/tmp' in initial['HostConfig'].get('Tmpfs', {}), 'Desktop needs ephemeral /tmp'
assert initial['HostConfig']['Init'], 'Desktop must reap child processes'
execute(f"from pathlib import Path; Path('/home/student/lab-files/{MARKER}').write_text('{MARKER}')")

try:
    for signal_mode in ('forced', 'graceful'):
        execute(f"from pathlib import Path; Path('/tmp/{MARKER}').write_text('temporary'); assert Path('/tmp/.X1-lock').exists()")
        if signal_mode == 'forced':
            docker('kill', '--signal', 'KILL', CONTAINER)
        else:
            docker('stop', '--time', '20', CONTAINER)
        print(f'{signal_mode}: desktop stopped, starting the SAME container', flush=True)
        docker('start', CONTAINER)
        wait_healthy()
        assert info()['Id'] == initial_id, 'Restart test must reuse the existing container'
        execute(f"from pathlib import Path; assert not Path('/tmp/{MARKER}').exists(); assert Path('/home/student/lab-files/{MARKER}').read_text() == '{MARKER}'")
        print(f'{signal_mode}: healthy, temporary state cleared, lab file preserved', flush=True)
finally:
    if not info()['State']['Running']:
        docker('start', CONTAINER)
    wait_healthy()
    execute(f"from pathlib import Path; Path('/home/student/lab-files/{MARKER}').unlink(missing_ok=True)")

print('Restart regression passed: forced stop + graceful stop', flush=True)
