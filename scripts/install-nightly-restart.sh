#!/usr/bin/env bash
# Install a nightly Chromium restart on a Jukboks Raspberry Pi kiosk.
# Restarts Chromium every night at 04:00 to clear MusicKit memory leaks
# that can cause "Aw, Snap!" crashes after long uptimes.
#
# Run as the desktop user (NOT root):
#   curl -fsSL https://jukboks.com/scripts/install-nightly-restart.sh | bash
#
# To remove it later:
#   crontab -l | grep -v jukboks-nightly-restart | crontab -

set -e

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as your normal user, not root (no sudo)."
  exit 1
fi

MARKER="# jukboks-nightly-restart"
CRON_LINE="0 4 * * * pkill -f chromium $MARKER"

# Strip any existing jukboks-nightly-restart lines, then append the fresh one.
( crontab -l 2>/dev/null | grep -v "$MARKER" ; echo "$CRON_LINE" ) | crontab -

echo "Installed nightly Chromium restart at 04:00 local time."
echo "Current crontab:"
crontab -l | grep -E "(jukboks|chromium)" || true
echo ""
echo "Chromium will be killed and the kiosk autostart will relaunch it."
echo "To remove: crontab -l | grep -v $MARKER | crontab -"
