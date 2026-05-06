#!/usr/bin/env bash
# Install the jukboks audio agent on an existing Jukboks Raspberry Pi kiosk.
# Run as the desktop user (NOT root):
#   curl -fsSL https://jukboks.com/scripts/install-audio-agent.sh | bash

set -e

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as your normal user, not root (no sudo)."
  exit 1
fi

SERVER_URL="${JUKBOKS_URL:-https://jukboks.com}"
INSTALL_DIR="$HOME/.local/bin"
SERVICE_DIR="$HOME/.config/systemd/user"

mkdir -p "$INSTALL_DIR" "$SERVICE_DIR"

echo "Downloading audio agent..."
curl -fsSL "$SERVER_URL/scripts/audio-agent.sh" -o "$INSTALL_DIR/jukboks-audio-agent"
chmod +x "$INSTALL_DIR/jukboks-audio-agent"

echo "Installing systemd user service..."
cat > "$SERVICE_DIR/jukboks-audio-agent.service" << EOF
[Unit]
Description=Jukboks Audio Agent
After=graphical-session.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/jukboks-audio-agent
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Allow the user service to keep running after logout (needed because the Pi
# auto-logs in on tty1; if you SSH in too you don't want a logout to kill it).
sudo loginctl enable-linger "$USER" 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable jukboks-audio-agent.service
systemctl --user restart jukboks-audio-agent.service

sleep 2
echo ""
echo "Done! Status:"
systemctl --user status jukboks-audio-agent.service --no-pager | head -15 || true
echo ""
echo "Within ~60 seconds your audio outputs will appear in the Jukboks admin"
echo "dashboard at $SERVER_URL/admin/venues."
