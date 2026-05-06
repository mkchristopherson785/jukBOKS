#!/usr/bin/env python3
"""
Hidden hotkey to exit Jukboks kiosk mode.

Press the letter 'q' five times within 3 seconds on any plugged-in keyboard
and this watcher will stop the chromium-kiosk systemd service, dropping you
back to a console.

Runs as a systemd service (kiosk-exit-watcher.service) so it works even when
Chromium is fullscreen and capturing input.
"""

import subprocess
import time
import sys
from evdev import InputDevice, list_devices, ecodes

TRIGGER_KEY = ecodes.KEY_Q
COUNT_NEEDED = 5
WINDOW_SECONDS = 3.0
STOP_CMD = ["systemctl", "stop", "chromium-kiosk"]


def find_keyboards():
    keyboards = []
    for path in list_devices():
        try:
            dev = InputDevice(path)
        except Exception:
            continue
        caps = dev.capabilities().get(ecodes.EV_KEY, [])
        # A real keyboard exposes letter keys (KEY_A is a good marker).
        if ecodes.KEY_A in caps:
            keyboards.append(dev)
    return keyboards


def watch(devices):
    presses = []
    print(f"[kiosk-exit-watcher] watching {len(devices)} keyboard(s) for 'qqqqq'", flush=True)
    from select import select
    fd_to_dev = {dev.fd: dev for dev in devices}
    while True:
        r, _, _ = select(fd_to_dev, [], [])
        for fd in r:
            for event in fd_to_dev[fd].read():
                if event.type != ecodes.EV_KEY:
                    continue
                if event.value != 1:  # only key-down
                    continue
                if event.code != TRIGGER_KEY:
                    presses.clear()
                    continue
                now = time.monotonic()
                presses.append(now)
                # keep only presses within the time window
                presses[:] = [t for t in presses if now - t <= WINDOW_SECONDS]
                if len(presses) >= COUNT_NEEDED:
                    print("[kiosk-exit-watcher] trigger fired -> stopping chromium-kiosk", flush=True)
                    subprocess.run(STOP_CMD, check=False)
                    presses.clear()
                    time.sleep(2)


def main():
    while True:
        kbds = find_keyboards()
        if not kbds:
            print("[kiosk-exit-watcher] no keyboards found, retrying in 5s", flush=True)
            time.sleep(5)
            continue
        try:
            watch(kbds)
        except OSError as e:
            print(f"[kiosk-exit-watcher] device error: {e}; rescanning", flush=True)
            time.sleep(2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
