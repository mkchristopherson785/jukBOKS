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

# Collect macOS system health. Mirrors the Pi's collect_health() so the same
# admin VenuesPage health card works for both platforms.
#   - CPU temp: not available without extra tooling on Apple Silicon (the
#     `powermetrics` route needs sudo). Reported as null; the admin card
#     handles missing values gracefully.
#   - cpuLoad1: 1-min load average via `sysctl`.
#   - memory: `vm_stat` page counts + `sysctl hw.memsize`.
#   - disk: `df -k /`.
#   - uptime: `sysctl kern.boottime`.
#   - Chromium → Google Chrome: sum RSS across all "Google Chrome" processes.
collect_health() {
  python3 - <<'PY' 2>/dev/null || echo '{}'
import json, os, re, subprocess, time

def sh(cmd):
  try:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
  except Exception:
    return ""

# Load average (1-min)
load1 = None
try:
  out = sh(["sysctl", "-n", "vm.loadavg"]).strip()
  m = re.findall(r"[0-9.]+", out)
  if m: load1 = round(float(m[0]), 2)
except Exception: pass

# Memory: total via sysctl, free/used breakdown via vm_stat (in pages).
mem_total_mb = mem_free_mb = mem_used_pct = None
try:
  total_bytes = int(sh(["sysctl", "-n", "hw.memsize"]).strip() or 0)
  if total_bytes:
    mem_total_mb = round(total_bytes / 1024 / 1024, 1)
  vm = sh(["vm_stat"])
  page_size = 4096
  ps_m = re.search(r"page size of (\d+)", vm)
  if ps_m: page_size = int(ps_m.group(1))
  def pages(name):
    m = re.search(rf"{name}:\s+(\d+)", vm)
    return int(m.group(1)) if m else 0
  free_pages = pages("Pages free") + pages(r"Pages speculative")
  inactive_pages = pages(r"Pages inactive")
  # macOS treats inactive + free + speculative as effectively available.
  avail_bytes = (free_pages + inactive_pages) * page_size
  if total_bytes:
    mem_free_mb = round(avail_bytes / 1024 / 1024, 1)
    mem_used_pct = round((1 - avail_bytes / total_bytes) * 100, 1)
except Exception: pass

# System uptime: parse `kern.boottime` → "{ sec = 1715000000, usec = 0 } …"
uptime_sec = None
try:
  out = sh(["sysctl", "-n", "kern.boottime"])
  m = re.search(r"sec\s*=\s*(\d+)", out)
  if m:
    uptime_sec = int(time.time() - int(m.group(1)))
except Exception: pass

# Disk used % on /
disk_used_pct = None
try:
  s = os.statvfs("/")
  total = s.f_blocks * s.f_frsize
  free = s.f_bavail * s.f_frsize
  if total > 0:
    disk_used_pct = round((1 - free / total) * 100, 1)
except Exception: pass

# Chrome memory + uptime — sum RSS across all "Google Chrome" processes.
# `ps -eo etime,rss,command` — etime is [[dd-]hh:]mm:ss
chrome_mem_mb = None
chrome_uptime = None
chrome_running = False
def parse_etime(s):
  s = s.strip()
  days = 0
  if "-" in s:
    d, s = s.split("-", 1); days = int(d)
  parts = s.split(":")
  parts = [int(p) for p in parts]
  if len(parts) == 3: h, m, sec = parts
  elif len(parts) == 2: h = 0; m, sec = parts
  else: h = 0; m = 0; sec = parts[0]
  return days * 86400 + h * 3600 + m * 60 + sec
try:
  out = sh(["ps", "-axo", "etime=,rss=,command="])
  total_rss = 0
  oldest = 0
  for line in out.splitlines():
    if "Google Chrome" not in line: continue
    parts = line.strip().split(None, 2)
    if len(parts) < 3: continue
    etime, rss, _ = parts
    chrome_running = True
    try:
      total_rss += int(rss)
      oldest = max(oldest, parse_etime(etime))
    except Exception: pass
  if chrome_running:
    chrome_mem_mb = round(total_rss / 1024, 1)
    chrome_uptime = oldest
except Exception: pass

print(json.dumps({
  "cpuTempC": None,
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

  # 3) Report system health (same payload shape as the Pi).
  HEALTH_JSON="$(collect_health)"
  if [ -n "$HEALTH_JSON" ] && [ "$HEALTH_JSON" != "{}" ]; then
    PAYLOAD="$(printf '%s' "$HEALTH_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
d['deviceId'] = '$DEVICE_ID'
print(json.dumps(d))
" 2>/dev/null)"
    if [ -n "$PAYLOAD" ]; then
      curl -fsS -m 10 -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "$BASE_URL/api/v1/venues/$VENUE_CODE/health" >/dev/null 2>>"$LOG_FILE" || \
        log "WARN: health POST failed"
    fi
  fi

  sleep 60
done
