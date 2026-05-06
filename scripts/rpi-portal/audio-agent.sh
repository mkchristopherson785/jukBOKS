#!/usr/bin/env bash
# jukboks-audio-agent
# Periodically:
#   1. Detects available PulseAudio/PipeWire output sinks on this Pi.
#   2. Reports them to the Jukboks server.
#   3. Polls for the admin-selected sink and applies it as the default output.
#
# Runs as the desktop user (NOT root) so it shares the audio session with the
# kiosk Chromium process. Installed as a systemd --user service.

set -u

CONFIG_FILE="/etc/jukboks/config.json"
DEVICE_ID_FILE="$HOME/.config/jukboks/device-id"
INTERVAL=60
TAB="$(printf '\t')"

mkdir -p "$(dirname "$DEVICE_ID_FILE")"

# Stable device ID for this Pi.
if [ ! -s "$DEVICE_ID_FILE" ]; then
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen > "$DEVICE_ID_FILE"
  else
    cat /proc/sys/kernel/random/uuid > "$DEVICE_ID_FILE"
  fi
fi
DEVICE_ID="$(cat "$DEVICE_ID_FILE")"

# Make sure pactl can find the user's PipeWire/PulseAudio socket even when
# launched by systemd --user.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Friendly label heuristic from a PulseAudio/PipeWire sink name.
friendly_label() {
  local name="$1"
  case "$name" in
    *hdmi*|*HDMI*) echo "HDMI" ;;
    *Headphones*|*headphone*|*analog-stereo*) echo "3.5mm Headphone Jack" ;;
    *hifiberry*|*HiFiBerry*|*HifiBerry*) echo "HiFiBerry DAC" ;;
    *iqaudio*|*IQaudio*|*IQAudio*) echo "IQaudio HAT" ;;
    *justboom*|*JustBoom*) echo "JustBoom HAT" ;;
    *allo*|*Allo*) echo "Allo HAT" ;;
    *pisound*|*Pisound*) echo "Pisound HAT" ;;
    *soc_*sound*|*soc-sound*|*107c000000_sound*) echo "DAC HAT (RCA / 3.5mm)" ;;
    *bluez*|*bluetooth*) echo "Bluetooth Speaker" ;;
    *usb*|*USB*) echo "USB Audio" ;;
    *auto_null*|*dummy*) echo "(no audio device detected)" ;;
    *) echo "$name" ;;
  esac
}

while true; do
  if [ ! -r "$CONFIG_FILE" ]; then
    sleep "$INTERVAL"
    continue
  fi
  VENUE_CODE="$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('venue_code',''))" 2>/dev/null)"
  SERVER_URL="$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('url',''))" 2>/dev/null)"
  if [ -z "$VENUE_CODE" ] || [ -z "$SERVER_URL" ]; then
    sleep "$INTERVAL"
    continue
  fi

  # 1. Enumerate sinks. Build TAB-separated lines, then JSON-encode safely
  #    via python3 to avoid quote/backslash injection from sink names.
  SINK_LINES=""
  while IFS=$'\t' read -r _ NAME _ _ _; do
    [ -z "$NAME" ] && continue
    LABEL="$(friendly_label "$NAME")"
    SINK_LINES+="${NAME}${TAB}${LABEL}"$'\n'
  done < <(pactl list short sinks 2>/dev/null)

  SINKS_JSON="$(printf '%s' "$SINK_LINES" | python3 -c "
import json, sys
out = []
for line in sys.stdin.read().splitlines():
    if not line.strip():
        continue
    parts = line.split('\t', 1)
    name = parts[0]
    desc = parts[1] if len(parts) > 1 else name
    out.append({'name': name, 'description': desc})
print(json.dumps(out))
" 2>/dev/null)"
  [ -z "$SINKS_JSON" ] && SINKS_JSON="[]"

  # 2. Report sinks (best-effort).
  curl -fsS -m 10 -X POST \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"devices\":$SINKS_JSON}" \
    "$SERVER_URL/api/v1/venues/$VENUE_CODE/audio-devices" >/dev/null 2>&1 || true

  # 3. Poll for admin-selected sink.
  RESP="$(curl -fsS -m 10 "$SERVER_URL/api/v1/venues/$VENUE_CODE/audio-sink?deviceId=$DEVICE_ID" 2>/dev/null || echo '')"
  TARGET="$(echo "$RESP" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get('sink') or '')
except Exception:
  print('')
" 2>/dev/null)"

  # 4. Apply if different from current default.
  if [ -n "$TARGET" ]; then
    CURRENT="$(pactl get-default-sink 2>/dev/null || echo '')"
    if [ "$CURRENT" != "$TARGET" ]; then
      pactl set-default-sink "$TARGET" 2>/dev/null && \
        pactl set-sink-mute "$TARGET" 0 2>/dev/null && \
        pactl set-sink-volume "$TARGET" 80% 2>/dev/null
    fi
  fi

  sleep "$INTERVAL"
done
