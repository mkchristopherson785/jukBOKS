#!/bin/bash
set -e

VENUE_CODE=""
JUKBOKS_URL=""
LAYOUT="square"
AUDIO_OUTPUT="auto"

usage() {
  echo "Jukboks Raspberry Pi Kiosk Setup"
  echo ""
  echo "Usage: sudo bash rpi-setup.sh --venue-code YOUR_CODE --url https://your-app.replit.app"
  echo ""
  echo "Options:"
  echo "  --venue-code    Your venue code (required)"
  echo "  --url           Your Jukboks app URL (required)"
  echo "  --layout        Display layout: 'square' or 'default' (default: square)"
  echo "  --audio         Audio output: 'hdmi', 'headphone', or 'auto' (default: auto)"
  echo "  -h, --help      Show this help message"
  echo ""
  echo "Example:"
  echo "  sudo bash rpi-setup.sh --venue-code demo --url https://jukboks.replit.app"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --venue-code) VENUE_CODE="$2"; shift 2 ;;
    --url) JUKBOKS_URL="$2"; shift 2 ;;
    --layout) LAYOUT="$2"; shift 2 ;;
    --audio) AUDIO_OUTPUT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [ -z "$VENUE_CODE" ] || [ -z "$JUKBOKS_URL" ]; then
  echo "Error: --venue-code and --url are required"
  echo ""
  usage
fi

JUKBOKS_URL="${JUKBOKS_URL%/}"
KIOSK_URL="${JUKBOKS_URL}/kiosk/${VENUE_CODE}?autostart=true&layout=${LAYOUT}"

echo "========================================="
echo "  Jukboks Raspberry Pi Kiosk Setup"
echo "========================================="
echo ""
echo "Venue Code: $VENUE_CODE"
echo "Kiosk URL:  $KIOSK_URL"
echo "Layout:     $LAYOUT"
echo "Audio:      $AUDIO_OUTPUT"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run with sudo"
  exit 1
fi

REAL_USER="${SUDO_USER:-pi}"
REAL_HOME=$(eval echo ~$REAL_USER)

echo "[1/6] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo "[2/6] Installing required packages..."
apt-get install -y -qq \
  chromium-browser \
  xdotool \
  xserver-xorg \
  x11-xserver-utils \
  xinit \
  openbox \
  pulseaudio \
  unclutter \
  fonts-liberation \
  libnss3

echo "[3/6] Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d/
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $REAL_USER --noclear %I \$TERM
EOF

echo "[4/6] Setting up kiosk autostart..."
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
  "KIOSK_URL_PLACEHOLDER" &
OPENBOX_EOF

sed -i "s|KIOSK_URL_PLACEHOLDER|${KIOSK_URL}|g" "$REAL_HOME/.config/openbox/autostart"

cat > "$REAL_HOME/.bash_profile" << 'BASH_PROFILE_EOF'
[[ -z $DISPLAY && $XDG_VTNR -eq 1 ]] && startx -- -nocursor
BASH_PROFILE_EOF

cat > "$REAL_HOME/.xinitrc" << 'XINITRC_EOF'
exec openbox-session
XINITRC_EOF

chown -R "$REAL_USER:$REAL_USER" "$REAL_HOME/.config"
chown "$REAL_USER:$REAL_USER" "$REAL_HOME/.bash_profile"
chown "$REAL_USER:$REAL_USER" "$REAL_HOME/.xinitrc"

echo "[5/6] Configuring audio output..."
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

echo "[6/6] Creating management scripts..."

cat > /usr/local/bin/jukboks-status << 'STATUS_EOF'
#!/bin/bash
echo "=== Jukboks Kiosk Status ==="
if pgrep -x chromium-browse > /dev/null; then
  echo "Browser: Running"
else
  echo "Browser: Stopped"
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
pkill chromium-browse 2>/dev/null
sleep 2
sudo -u "$SUDO_USER" DISPLAY=:0 chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run \
  --user-agent="Mozilla/5.0 (Linux; Raspberry Pi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  "KIOSK_URL_PLACEHOLDER" &
echo "Kiosk restarted."
RESTART_EOF
sed -i "s|KIOSK_URL_PLACEHOLDER|${KIOSK_URL}|g" /usr/local/bin/jukboks-restart
chmod +x /usr/local/bin/jukboks-restart

cat > /usr/local/bin/jukboks-update-venue << 'UPDATE_EOF'
#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: jukboks-update-venue NEW_VENUE_CODE"
  exit 1
fi
NEW_CODE="$1"
REAL_HOME=$(eval echo ~${SUDO_USER:-pi})
sed -i "s|/kiosk/[^?]*|/kiosk/${NEW_CODE}|g" "$REAL_HOME/.config/openbox/autostart"
sed -i "s|/kiosk/[^?]*|/kiosk/${NEW_CODE}|g" /usr/local/bin/jukboks-restart
echo "Venue code updated to: $NEW_CODE"
echo "Reboot to apply: sudo reboot"
UPDATE_EOF
chmod +x /usr/local/bin/jukboks-update-venue

cat > /etc/systemd/system/jukboks-watchdog.service << EOF
[Unit]
Description=Jukboks Kiosk Watchdog
After=graphical.target

[Service]
Type=simple
User=$REAL_USER
Environment=DISPLAY=:0
ExecStart=/bin/bash -c 'while true; do if ! pgrep -x chromium-browse > /dev/null; then sleep 10; if ! pgrep -x chromium-browse > /dev/null; then /usr/local/bin/jukboks-restart; fi; fi; sleep 30; done'
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
echo "Your Raspberry Pi will now:"
echo "  - Auto-boot into the Jukboks kiosk"
echo "  - Auto-start playback on schedule"
echo "  - Auto-restart the browser if it crashes"
echo "  - Show album art, song info, and QR code"
echo ""
echo "Useful commands:"
echo "  jukboks-status         - Check kiosk status"
echo "  jukboks-restart        - Restart the browser"
echo "  jukboks-update-venue X - Change venue code"
echo ""
echo "Manage remotely via SSH:"
echo "  ssh ${REAL_USER}@$(hostname -I | awk '{print $1}')"
echo ""
echo "Reboot now to start the kiosk:"
echo "  sudo reboot"
echo ""
