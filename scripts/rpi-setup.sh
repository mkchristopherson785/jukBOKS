#!/bin/bash
set -e

VENUE_CODE=""
JUKBOKS_URL=""
LAYOUT="square"
AUDIO_OUTPUT="auto"
HOTSPOT_ONLY=false

usage() {
  echo "Jukboks Raspberry Pi Kiosk Setup"
  echo ""
  echo "Usage:"
  echo "  Full setup:    sudo bash rpi-setup.sh --venue-code CODE --url URL"
  echo "  Hotspot only:  sudo bash rpi-setup.sh --hotspot-only"
  echo ""
  echo "Options:"
  echo "  --venue-code    Your venue code (optional if using --hotspot-only)"
  echo "  --url           Your Jukboks app URL (optional if using --hotspot-only)"
  echo "  --layout        Display layout: 'square' or 'default' (default: square)"
  echo "  --audio         Audio output: 'hdmi', 'headphone', or 'auto' (default: auto)"
  echo "  --hotspot-only  Skip venue config, set up hotspot for phone-based setup"
  echo "  -h, --help      Show this help message"
  echo ""
  echo "Examples:"
  echo "  sudo bash rpi-setup.sh --hotspot-only"
  echo "  sudo bash rpi-setup.sh --venue-code demo --url https://jukboks.replit.app"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --venue-code) VENUE_CODE="$2"; shift 2 ;;
    --url) JUKBOKS_URL="$2"; shift 2 ;;
    --layout) LAYOUT="$2"; shift 2 ;;
    --audio) AUDIO_OUTPUT="$2"; shift 2 ;;
    --hotspot-only) HOTSPOT_ONLY=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [ "$HOTSPOT_ONLY" = false ] && ([ -z "$VENUE_CODE" ] || [ -z "$JUKBOKS_URL" ]); then
  echo "Error: --venue-code and --url are required (or use --hotspot-only)"
  echo ""
  usage
fi

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run with sudo"
  exit 1
fi

REAL_USER="${SUDO_USER:-pi}"
REAL_HOME=$(eval echo ~$REAL_USER)

if [ "$HOTSPOT_ONLY" = true ]; then
  KIOSK_URL="UNCONFIGURED"
else
  JUKBOKS_URL="${JUKBOKS_URL%/}"
  KIOSK_URL="${JUKBOKS_URL}/kiosk/${VENUE_CODE}?autostart=true&layout=${LAYOUT}"
fi

echo "========================================="
echo "  Jukboks Raspberry Pi Kiosk Setup"
echo "========================================="
echo ""
if [ "$HOTSPOT_ONLY" = true ]; then
  echo "Mode:       Hotspot Setup (configure via phone)"
else
  echo "Venue Code: $VENUE_CODE"
  echo "Kiosk URL:  $KIOSK_URL"
  echo "Layout:     $LAYOUT"
  echo "Audio:      $AUDIO_OUTPUT"
fi
echo ""

echo "[1/8] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo "[2/8] Installing required packages..."
if apt-cache policy chromium 2>/dev/null | grep -qE "Candidate: [0-9]"; then
  CHROMIUM_PKG="chromium"
elif apt-cache policy chromium-browser 2>/dev/null | grep -qE "Candidate: [0-9]"; then
  CHROMIUM_PKG="chromium-browser"
else
  echo "Error: Neither 'chromium' nor 'chromium-browser' is installable on this system."
  exit 1
fi
echo "Using Chromium package: $CHROMIUM_PKG"
apt-get install -y -qq \
  $CHROMIUM_PKG \
  xdotool \
  xserver-xorg \
  x11-xserver-utils \
  xinit \
  openbox \
  pulseaudio \
  unclutter \
  fonts-liberation \
  libnss3 \
  hostapd \
  dnsmasq \
  python3 \
  iptables

if [ ! -x /usr/bin/chromium-browser ] && [ -x /usr/bin/chromium ]; then
  ln -sf /usr/bin/chromium /usr/local/bin/chromium-browser
fi

systemctl unmask hostapd 2>/dev/null || true
systemctl stop hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true
systemctl disable hostapd 2>/dev/null || true
systemctl disable dnsmasq 2>/dev/null || true

echo "[3/8] Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d/
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $REAL_USER --noclear %I \$TERM
EOF

echo "[4/8] Installing captive portal..."
mkdir -p /opt/jukboks
mkdir -p /etc/jukboks

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/rpi-portal/portal.py" ]; then
  cp "$SCRIPT_DIR/rpi-portal/portal.py" /opt/jukboks/portal.py
  cp "$SCRIPT_DIR/rpi-portal/wifi-manager.sh" /opt/jukboks/wifi-manager.sh
else
  echo "Warning: Portal files not found at $SCRIPT_DIR/rpi-portal/"
  echo "         Download from the Jukboks repository."
fi
chmod +x /opt/jukboks/portal.py
chmod +x /opt/jukboks/wifi-manager.sh

if [ "$HOTSPOT_ONLY" = false ]; then
  cat > /etc/jukboks/config.json << EOF
{
  "ssid": "",
  "url": "$JUKBOKS_URL",
  "venue_code": "$VENUE_CODE",
  "layout": "$LAYOUT",
  "audio": "$AUDIO_OUTPUT",
  "configured": true
}
EOF
fi

cat > /etc/systemd/system/jukboks-wifi.service << EOF
[Unit]
Description=Jukboks WiFi Manager
Before=graphical.target
After=network-pre.target

[Service]
Type=simple
ExecStart=/bin/bash /opt/jukboks/wifi-manager.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable jukboks-wifi.service

echo "[5/8] Setting up kiosk autostart..."
mkdir -p "$REAL_HOME/.config/openbox"

cat > "$REAL_HOME/.config/openbox/autostart" << 'OPENBOX_EOF'
xset s off
xset s noblank
xset -dpms

unclutter -idle 0.5 -root &

sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' \
  "$HOME/.config/chromium/Default/Preferences" 2>/dev/null || true
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' \
  "$HOME/.config/chromium/Default/Preferences" 2>/dev/null || true

sleep 5

KIOSK_URL=$(python3 -c "
import json
try:
    c = json.load(open('/etc/jukboks/config.json'))
    if c.get('configured') and c.get('url') and c.get('venue_code'):
        layout = c.get('layout', 'square')
        print(f\"{c['url']}/kiosk/{c['venue_code']}?autostart=true&layout={layout}\")
    else:
        print('')
except:
    print('')
" 2>/dev/null)

if [ -n "$KIOSK_URL" ]; then
  chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-translate \
    --disable-features=TranslateUI \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --no-first-run \
    --disable-restore-session-state \
    --user-agent="Mozilla/5.0 (Linux; Raspberry Pi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    "$KIOSK_URL" &
fi
OPENBOX_EOF

cat > "$REAL_HOME/.bash_profile" << 'BASH_PROFILE_EOF'
[[ -z $DISPLAY && $XDG_VTNR -eq 1 ]] && startx -- -nocursor
BASH_PROFILE_EOF

cat > "$REAL_HOME/.xinitrc" << 'XINITRC_EOF'
exec openbox-session
XINITRC_EOF

chown -R "$REAL_USER:$REAL_USER" "$REAL_HOME/.config"
chown "$REAL_USER:$REAL_USER" "$REAL_HOME/.bash_profile"
chown "$REAL_USER:$REAL_USER" "$REAL_HOME/.xinitrc"

echo "[6/8] Configuring audio output..."
case $AUDIO_OUTPUT in
  hdmi)
    amixer cset numid=3 2 2>/dev/null || true
    echo "Audio set to HDMI"
    ;;
  headphone)
    amixer cset numid=3 1 2>/dev/null || true
    echo "Audio set to 3.5mm headphone jack"
    ;;
  *)
    amixer cset numid=3 0 2>/dev/null || true
    echo "Audio set to auto-detect"
    ;;
esac

amixer sset 'Master' 80% 2>/dev/null || true
amixer sset 'PCM' 80% 2>/dev/null || true

echo "[7/8] Creating management scripts..."

cat > /usr/local/bin/jukboks-apply-config << 'APPLY_EOF'
#!/bin/bash
KIOSK_URL="$1"
AUDIO="$2"

case "$AUDIO" in
  hdmi) amixer cset numid=3 2 2>/dev/null || true ;;
  headphone) amixer cset numid=3 1 2>/dev/null || true ;;
  *) amixer cset numid=3 0 2>/dev/null || true ;;
esac

echo "Configuration applied. Kiosk URL: $KIOSK_URL"
APPLY_EOF
chmod +x /usr/local/bin/jukboks-apply-config

cat > /usr/local/bin/jukboks-status << 'STATUS_EOF'
#!/bin/bash
echo "=== Jukboks Kiosk Status ==="
if [ -f /etc/jukboks/config.json ]; then
  CONFIGURED=$(python3 -c "import json; c=json.load(open('/etc/jukboks/config.json')); print('Yes' if c.get('configured') else 'No')" 2>/dev/null)
  VENUE=$(python3 -c "import json; c=json.load(open('/etc/jukboks/config.json')); print(c.get('venue_code','N/A'))" 2>/dev/null)
  echo "Configured: $CONFIGURED"
  echo "Venue: $VENUE"
else
  echo "Configured: No"
fi
if pgrep -f "chromium.*--kiosk" > /dev/null; then
  echo "Browser: Running"
else
  echo "Browser: Stopped"
fi
if pgrep -f hostapd > /dev/null; then
  echo "Hotspot: Active (Jukboks-Setup)"
else
  echo "Hotspot: Inactive"
fi
echo "Uptime: $(uptime -p)"
echo "IP: $(hostname -I | awk '{print $1}')"
echo "Memory: $(free -h | awk '/Mem:/ {print $3 "/" $2}')"
echo "CPU Temp: $(vcgencmd measure_temp 2>/dev/null || echo 'N/A')"
STATUS_EOF
chmod +x /usr/local/bin/jukboks-status

cat > /usr/local/bin/jukboks-restart << 'RESTART_EOF'
#!/bin/bash
echo "Restarting Jukboks kiosk..."
pkill -f "chromium.*--kiosk" 2>/dev/null
pkill chromium-browse 2>/dev/null
pkill chromium 2>/dev/null
sleep 2

KIOSK_URL=$(python3 -c "
import json
try:
    c = json.load(open('/etc/jukboks/config.json'))
    layout = c.get('layout', 'square')
    print(f\"{c['url']}/kiosk/{c['venue_code']}?autostart=true&layout={layout}\")
except:
    print('')
" 2>/dev/null)

if [ -n "$KIOSK_URL" ]; then
  REAL_USER="${SUDO_USER:-pi}"
  sudo -u "$REAL_USER" DISPLAY=:0 chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run \
    --user-agent="Mozilla/5.0 (Linux; Raspberry Pi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    "$KIOSK_URL" &
  echo "Kiosk restarted."
else
  echo "No configuration found. Run setup first."
fi
RESTART_EOF
chmod +x /usr/local/bin/jukboks-restart

cat > /usr/local/bin/jukboks-update-venue << 'UPDATE_EOF'
#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: jukboks-update-venue NEW_VENUE_CODE [NEW_URL]"
  exit 1
fi
python3 -c "
import json, sys
c = json.load(open('/etc/jukboks/config.json'))
c['venue_code'] = sys.argv[1]
if len(sys.argv) > 2:
    c['url'] = sys.argv[2]
json.dump(c, open('/etc/jukboks/config.json','w'), indent=2)
print(f\"Venue code updated to: {c['venue_code']}\")
print(f\"URL: {c['url']}\")
" "$@"
echo "Reboot to apply: sudo reboot"
UPDATE_EOF
chmod +x /usr/local/bin/jukboks-update-venue

cat > /usr/local/bin/jukboks-reset << 'RESET_EOF'
#!/bin/bash
echo "Resetting Jukboks configuration..."
rm -f /etc/jukboks/config.json
echo "Configuration cleared. Reboot to start setup hotspot."
echo "  sudo reboot"
RESET_EOF
chmod +x /usr/local/bin/jukboks-reset

echo "[8/8] Setting up watchdog service..."

cat > /etc/systemd/system/jukboks-watchdog.service << EOF
[Unit]
Description=Jukboks Kiosk Watchdog
After=graphical.target

[Service]
Type=simple
User=$REAL_USER
Environment=DISPLAY=:0
ExecStart=/bin/bash -c 'while true; do if [ -f /etc/jukboks/config.json ] && python3 -c "import json; c=json.load(open(\"/etc/jukboks/config.json\")); exit(0 if c.get(\"configured\") else 1)" 2>/dev/null; then if ! pgrep -f "chromium.*--kiosk" > /dev/null; then sleep 10; if ! pgrep -f "chromium.*--kiosk" > /dev/null; then /usr/local/bin/jukboks-restart; fi; fi; fi; sleep 30; done'
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable jukboks-watchdog.service

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
if [ "$HOTSPOT_ONLY" = true ]; then
  echo "Your Raspberry Pi is ready for phone-based setup!"
  echo ""
  echo "After rebooting:"
  echo "  1. The Pi will create a 'Jukboks-Setup' WiFi network"
  echo "  2. Connect to it from your phone (password: jukboks123)"
  echo "  3. A setup page will open automatically"
  echo "  4. Enter your WiFi, venue code, and app URL"
  echo "  5. The Pi will connect and start the kiosk"
else
  echo "Your Raspberry Pi will now:"
  echo "  - Auto-boot into the Jukboks kiosk"
  echo "  - Auto-start playback on schedule"
  echo "  - Auto-restart the browser if it crashes"
  echo "  - Show album art, song info, and QR code"
fi
echo ""
echo "If WiFi connection fails, the Pi will automatically"
echo "create a 'Jukboks-Setup' hotspot for reconfiguration."
echo ""
echo "Useful commands:"
echo "  jukboks-status         - Check kiosk status"
echo "  jukboks-restart        - Restart the browser"
echo "  jukboks-update-venue X - Change venue code"
echo "  jukboks-reset          - Clear config and restart setup"
echo ""
echo "Reboot now to start:"
echo "  sudo reboot"
echo ""
