#!/bin/bash
# jukboks-mac-kiosk launcher.
# Runs Chrome in fullscreen kiosk mode pointing at the venue URL.
# Wrapped in a while-loop so any Chrome exit (crash, killed by user, OS update)
# is followed by a fresh launch within 3 seconds. Mirrors the Pi autostart
# wrapper but for macOS.
#
# Config lives in ~/.config/jukboks/kiosk.env — sourced on every restart so
# you can edit the URL and the next loop iteration picks it up without
# editing this script.

set -u

CONFIG_DIR="$HOME/.config/jukboks"
CONFIG_FILE="$CONFIG_DIR/kiosk.env"
LOG_FILE="$HOME/Library/Logs/jukboks-kiosk.log"

mkdir -p "$CONFIG_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Find Chrome. Prefer Google Chrome, fall back to Chromium, then Chrome Canary.
CHROME=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
do
  if [ -x "$candidate" ]; then
    CHROME="$candidate"
    break
  fi
done

if [ -z "$CHROME" ]; then
  log "FATAL: Chrome not found. Install Google Chrome from https://www.google.com/chrome/"
  osascript -e 'display dialog "Google Chrome is not installed.\n\nDownload it from google.com/chrome and re-run the kiosk installer." buttons {"OK"} default button 1 with icon stop' >/dev/null 2>&1 || true
  exit 1
fi

# Loop forever, restarting Chrome on any exit.
while true; do
  if [ ! -f "$CONFIG_FILE" ]; then
    log "FATAL: $CONFIG_FILE missing. Re-run the installer."
    sleep 30
    continue
  fi

  # shellcheck source=/dev/null
  . "$CONFIG_FILE"

  if [ -z "${KIOSK_URL:-}" ]; then
    log "FATAL: KIOSK_URL not set in $CONFIG_FILE"
    sleep 30
    continue
  fi

  # Dedicated profile dir so we don't clash with the user's normal Chrome.
  PROFILE_DIR="$HOME/.config/jukboks/chrome-profile"
  mkdir -p "$PROFILE_DIR"

  log "Launching Chrome → $KIOSK_URL"

  "$CHROME" \
    --kiosk \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --disable-translate \
    --disable-features=TranslateUI \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --noerrdialogs \
    --autoplay-policy=no-user-gesture-required \
    --start-fullscreen \
    --app="$KIOSK_URL" \
    >> "$LOG_FILE" 2>&1

  log "Chrome exited with code $?. Relaunching in 3s."
  sleep 3
done
