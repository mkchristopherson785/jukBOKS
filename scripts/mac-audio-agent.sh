#!/bin/bash
# jukboks Mac audio agent.
# Mirrors the Pi audio agent (scripts/rpi-portal/audio-agent.sh) for macOS.
# Every 60s it lists output audio devices, POSTs them to the server, polls
# the desired sink + volume from the server, and applies them via
# `SwitchAudioSource` and `osascript`. Driven by config in
# ~/.config/jukboks/audio-agent.env (VENUE_CODE, BASE_URL).
#
# Volume is applied 0..100 via AppleScript (`set volume output volume`).
# Sink switching requires the `switchaudio-osx` brew package.

set -u

CONFIG_DIR="$HOME/.config/jukboks"
CONFIG_FILE="$CONFIG_DIR/audio-agent.env"
DEVICE_ID_FILE="$CONFIG_DIR/device-id"
LOG_FILE="$HOME/Library/Logs/jukboks-audio-agent.log"

mkdir -p "$CONFIG_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

if [ ! -f "$CONFIG_FILE" ]; then
  log "FATAL: $CONFIG_FILE missing. Re-run install-mac-audio-agent.sh."
  exit 1
fi

# shellcheck source=/dev/null
. "$CONFIG_FILE"

if [ -z "${VENUE_CODE:-}" ]; then
  log "FATAL: VENUE_CODE not set in $CONFIG_FILE"
  exit 1
fi
BASE_URL="${BASE_URL:-https://jukboks.com}"

# Find SwitchAudioSource (handle both Intel and Apple Silicon brew paths).
SAS=""
for candidate in \
  "/opt/homebrew/bin/SwitchAudioSource" \
  "/usr/local/bin/SwitchAudioSource" \
  "$(command -v SwitchAudioSource 2>/dev/null)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    SAS="$candidate"
    break
  fi
done

if [ -z "$SAS" ]; then
  log "FATAL: SwitchAudioSource not found. Install with: brew install switchaudio-osx"
  exit 1
fi

# Stable per-Mac device ID for the kiosk lock trust model.
if [ ! -f "$DEVICE_ID_FILE" ]; then
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen > "$DEVICE_ID_FILE"
  else
    date +%s%N | shasum | head -c 32 > "$DEVICE_ID_FILE"
  fi
fi
DEVICE_ID="$(cat "$DEVICE_ID_FILE")"

log "Starting (venue=$VENUE_CODE, sas=$SAS, deviceId=$DEVICE_ID)"

current_sink=""
current_volume=""

while true; do
  # 1) List output devices and POST them.
  # SwitchAudioSource -a -t output prints one device name per line.
  devices_json="["
  first=1
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # Cap each name at 200 chars to match server validation.
    name="$(printf '%s' "$line" | cut -c1-200)"
    # JSON-escape: backslash, double-quote, control chars.
    esc="$(printf '%s' "$name" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()),end="")' 2>/dev/null)"
    if [ -z "$esc" ]; then
      esc="\"$name\""
    fi
    if [ $first -eq 1 ]; then
      first=0
    else
      devices_json="${devices_json},"
    fi
    devices_json="${devices_json}{\"name\":${esc},\"description\":${esc}}"
  done < <("$SAS" -a -t output 2>/dev/null | head -20)
  devices_json="${devices_json}]"

  curl -fsS -X POST \
    -H "Content-Type: application/json" \
    --max-time 10 \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"devices\":$devices_json}" \
    "$BASE_URL/api/v1/venues/$VENUE_CODE/audio-devices" \
    >/dev/null 2>>"$LOG_FILE" || log "WARN: audio-devices POST failed"

  # 2) Poll desired sink + volume + restart flag from server.
  resp="$(curl -fsS --max-time 10 "$BASE_URL/api/v1/venues/$VENUE_CODE/audio-sink" 2>>"$LOG_FILE" || true)"
  if [ -n "$resp" ]; then
    desired_sink="$(printf '%s' "$resp" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("sink") or "")' 2>/dev/null || true)"
    desired_volume="$(printf '%s' "$resp" | python3 -c 'import json,sys;d=json.load(sys.stdin);v=d.get("volume");print(v if v is not None else "")' 2>/dev/null || true)"
    restart_requested="$(printf '%s' "$resp" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("1" if d.get("restartRequested") else "")' 2>/dev/null || true)"

    # 2a) Apply sink if changed.
    if [ -n "$desired_sink" ] && [ "$desired_sink" != "$current_sink" ]; then
      if "$SAS" -t output -s "$desired_sink" >>"$LOG_FILE" 2>&1; then
        log "Switched output to: $desired_sink"
        current_sink="$desired_sink"
      else
        log "WARN: failed to switch to '$desired_sink' (device not present?)"
      fi
    fi

    # 2b) Apply volume if changed.
    if [ -n "$desired_volume" ] && [ "$desired_volume" != "$current_volume" ]; then
      if osascript -e "set volume output volume $desired_volume" >>"$LOG_FILE" 2>&1; then
        log "Set volume to: $desired_volume"
        current_volume="$desired_volume"
      else
        log "WARN: failed to set volume to '$desired_volume'"
      fi
    fi

    # 2c) Restart kiosk Chrome on request (parallel to Pi behavior).
    if [ "$restart_requested" = "1" ]; then
      log "Restart requested — kicking kiosk LaunchAgent"
      curl -fsS -X POST --max-time 10 \
        "$BASE_URL/api/v1/venues/$VENUE_CODE/restart-ack" \
        >/dev/null 2>>"$LOG_FILE" || true
      launchctl kickstart -k "gui/$(id -u)/com.jukboks.kiosk" >>"$LOG_FILE" 2>&1 || \
        pkill -f "Google Chrome" >/dev/null 2>&1 || true
    fi
  fi

  sleep 60
done
