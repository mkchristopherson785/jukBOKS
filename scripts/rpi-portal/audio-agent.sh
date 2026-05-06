#!/usr/bin/env bash
# jukboks-audio-agent
# Periodically:
#   1. Detects available PulseAudio/PipeWire output sinks on this Pi.
#   2. Reports them to the Jukboks server.
#   3. Polls for the admin-selected sink and applies it as the default output.
#   4. Reports system health (CPU temp, memory, disk, Chromium uptime).
#
# Runs as the desktop user (NOT root) so it shares the audio session with the
# kiosk Chromium process. Installed as a systemd --user service.

set -u

CONFIG_FILE="/etc/jukboks/config.json"
DEVICE_ID_FILE="$HOME/.config/jukboks/device-id"
INTERVAL=10
TAB="$(printf '\t')"

# When Chromium RSS exceeds this many MB, kill it so the kiosk autostart can
# relaunch a fresh tab. Set high so we ONLY restart when truly close to OOM,
# never just because of a normal-sized leak. Override via env if needed.
# Set to 0 to disable the auto-restart entirely.
CHROMIUM_MAX_MB="${CHROMIUM_MAX_MB:-2500}"
# Hard ceiling: above this, restart even if music is currently playing. This
# prevents the "renderer OOM crash mid-set" failure mode that happens when
# songs play back-to-back and the polite "between-songs" guard never gets a
# chance to fire. Should be high enough to almost never trigger in normal use.
# Set to 0 to disable the hard ceiling and rely on the polite restart only.
CHROMIUM_HARD_MAX_MB="${CHROMIUM_HARD_MAX_MB:-3000}"
# Cooldown between restarts (seconds). Long, because a restart kills music.
CHROMIUM_RESTART_COOLDOWN=1800
LAST_CHROMIUM_RESTART=0

# Skip the restart if a sink is currently PLAYING (i.e. music is on). We'd
# rather let Chromium creep a bit higher than interrupt a song mid-play. The
# next health tick (~30s later) will retry; if it's still over threshold and
# no longer playing, the restart fires then.
chromium_safe_to_restart() {
  local sinks
  sinks="$(pactl list short sinks 2>/dev/null)" || return 0
  while IFS=$'\t' read -r _ name _ _ state; do
    [ -z "$name" ] && continue
    if [ "$state" = "RUNNING" ]; then
      return 1
    fi
  done <<< "$sinks"
  return 0
}

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

# Collect system health metrics. All values JSON-safe numbers.
collect_health() {
  python3 - <<'PY' 2>/dev/null || echo '{}'
import json, os, subprocess, time

def read_first(path):
  try:
    with open(path) as f: return f.read().strip()
  except Exception: return None

def num(x, default=None):
  try: return round(float(x), 2)
  except Exception: return default

# CPU temp (millidegree C on Pi)
cpu_temp = None
raw = read_first("/sys/class/thermal/thermal_zone0/temp")
if raw:
  try: cpu_temp = round(int(raw) / 1000.0, 1)
  except Exception: pass

# Load average
load1 = None
try:
  load1 = round(os.getloadavg()[0], 2)
except Exception: pass

# Memory from /proc/meminfo (in kB)
mem_total_kb = mem_avail_kb = None
try:
  with open("/proc/meminfo") as f:
    for line in f:
      if line.startswith("MemTotal:"): mem_total_kb = int(line.split()[1])
      elif line.startswith("MemAvailable:"): mem_avail_kb = int(line.split()[1])
      if mem_total_kb is not None and mem_avail_kb is not None: break
except Exception: pass

mem_total_mb = round(mem_total_kb / 1024, 1) if mem_total_kb else None
mem_free_mb = round(mem_avail_kb / 1024, 1) if mem_avail_kb else None
mem_used_pct = None
if mem_total_kb and mem_avail_kb:
  mem_used_pct = round((1 - mem_avail_kb / mem_total_kb) * 100, 1)

# System uptime
uptime_sec = None
raw = read_first("/proc/uptime")
if raw:
  try: uptime_sec = int(float(raw.split()[0]))
  except Exception: pass

# Disk free on /
disk_used_pct = None
try:
  s = os.statvfs("/")
  total = s.f_blocks * s.f_frsize
  free = s.f_bavail * s.f_frsize
  if total > 0:
    disk_used_pct = round((1 - free / total) * 100, 1)
except Exception: pass

# Chromium memory + uptime (sum across all chromium processes)
chrome_mem_mb = None
chrome_uptime = None
chrome_running = False
try:
  out = subprocess.run(
    ["ps", "-eo", "etimes=,rss=,comm="],
    capture_output=True, text=True, timeout=5
  ).stdout
  total_rss = 0
  oldest_etime = 0
  for line in out.splitlines():
    parts = line.strip().split(None, 2)
    if len(parts) < 3: continue
    etime, rss, comm = parts
    if "chrom" in comm.lower():
      chrome_running = True
      try:
        total_rss += int(rss)
        oldest_etime = max(oldest_etime, int(etime))
      except Exception: pass
  if chrome_running:
    chrome_mem_mb = round(total_rss / 1024, 1)
    chrome_uptime = oldest_etime
except Exception: pass

print(json.dumps({
  "cpuTempC": cpu_temp,
  "cpuLoad1": load1,
  "memUsedPercent": mem_used_pct,
  "memFreeMb": mem_free_mb,
  "memTotalMb": mem_total_mb,
  "diskUsedPercent": disk_used_pct,
  "uptimeSeconds": uptime_sec,
  "chromiumMemMb": chrome_mem_mb,
  "chromiumUptimeSeconds": chrome_uptime,
  "chromiumRunning": chrome_running,
}))
PY
}

HEALTH_TICK=0
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

  # 3. Poll for admin-selected sink + volume.
  RESP="$(curl -fsS -m 10 "$SERVER_URL/api/v1/venues/$VENUE_CODE/audio-sink?deviceId=$DEVICE_ID" 2>/dev/null || echo '')"
  TARGET="$(echo "$RESP" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get('sink') or '')
except Exception:
  print('')
" 2>/dev/null)"
  VOLUME="$(echo "$RESP" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  v = d.get('volume')
  print(int(v) if isinstance(v, (int, float)) and 0 <= v <= 100 else 65)
except Exception:
  print(65)
" 2>/dev/null)"
  [ -z "$VOLUME" ] && VOLUME=65

  # 4. Apply default sink if changed.
  if [ -n "$TARGET" ]; then
    CURRENT="$(pactl get-default-sink 2>/dev/null || echo '')"
    if [ "$CURRENT" != "$TARGET" ]; then
      pactl set-default-sink "$TARGET" 2>/dev/null
    fi
    pactl set-sink-mute "$TARGET" 0 2>/dev/null
    pactl set-sink-volume "$TARGET" "${VOLUME}%" 2>/dev/null
  else
    DEFAULT_SINK="$(pactl get-default-sink 2>/dev/null || echo '')"
    [ -n "$DEFAULT_SINK" ] && pactl set-sink-volume "$DEFAULT_SINK" "${VOLUME}%" 2>/dev/null
  fi

  # 5. Report system health every 3 ticks (~30s) — enough granularity
  #    without flooding the DB with writes. Also use the same data to
  #    auto-restart Chromium if it's leaking memory fast.
  HEALTH_TICK=$((HEALTH_TICK + 1))
  if [ "$HEALTH_TICK" -ge 3 ]; then
    HEALTH_TICK=0
    HEALTH_JSON="$(collect_health)"
    if [ -n "$HEALTH_JSON" ] && [ "$HEALTH_JSON" != "{}" ]; then
      # Inject deviceId without escaping issues: trim trailing } and append.
      PAYLOAD="$(echo "$HEALTH_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
d['deviceId'] = '$DEVICE_ID'
print(json.dumps(d))
" 2>/dev/null)"
      [ -n "$PAYLOAD" ] && curl -fsS -m 10 -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "$SERVER_URL/api/v1/venues/$VENUE_CODE/health" >/dev/null 2>&1 || true

      # Auto-restart Chromium if it's exceeded the memory ceiling. The
      # kiosk autostart entry will relaunch it with a fresh tab.
      CHROME_MB="$(echo "$HEALTH_JSON" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  v = d.get('chromiumMemMb')
  print(int(v) if isinstance(v, (int, float)) else 0)
except Exception:
  print(0)
" 2>/dev/null)"
      [ -z "$CHROME_MB" ] && CHROME_MB=0
      NOW="$(date +%s)"
      SINCE_LAST=$((NOW - LAST_CHROMIUM_RESTART))
      if [ "$CHROMIUM_HARD_MAX_MB" -gt 0 ] && [ "$CHROME_MB" -ge "$CHROMIUM_HARD_MAX_MB" ] && [ "$SINCE_LAST" -ge "$CHROMIUM_RESTART_COOLDOWN" ]; then
        echo "[jukboks-audio-agent] Chromium at ${CHROME_MB} MB (>= ${CHROMIUM_HARD_MAX_MB} MB HARD ceiling). Force restarting (may interrupt music)." >&2
        pkill -f chromium 2>/dev/null || true
        LAST_CHROMIUM_RESTART="$NOW"
      elif [ "$CHROMIUM_MAX_MB" -gt 0 ] && [ "$CHROME_MB" -ge "$CHROMIUM_MAX_MB" ] && [ "$SINCE_LAST" -ge "$CHROMIUM_RESTART_COOLDOWN" ]; then
        if chromium_safe_to_restart; then
          echo "[jukboks-audio-agent] Chromium at ${CHROME_MB} MB (>= ${CHROMIUM_MAX_MB} MB threshold), no audio playing. Restarting." >&2
          pkill -f chromium 2>/dev/null || true
          LAST_CHROMIUM_RESTART="$NOW"
        else
          echo "[jukboks-audio-agent] Chromium at ${CHROME_MB} MB but music is playing — deferring restart." >&2
        fi
      fi
    fi
  fi

  sleep "$INTERVAL"
done
