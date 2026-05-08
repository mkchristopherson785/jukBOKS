#!/bin/bash
# One-line installer for the jukboks Mac kiosk.
#   curl -fsSL https://jukboks.com/scripts/install-mac-kiosk.sh | bash
#
# What it does:
#   1. Downloads the launch wrapper to ~/.config/jukboks/kiosk-launch.sh
#   2. Prompts for your venue code (e.g. will-s-B5yA5h) and writes ~/.config/jukboks/kiosk.env
#   3. Installs a LaunchAgent at ~/Library/LaunchAgents/com.jukboks.kiosk.plist
#      that auto-starts the kiosk at every login and restarts it if it dies.
#
# After install, you should also (one-time, manual):
#   - System Settings → Users & Groups → Automatic login → set to your kiosk user
#   - System Settings → Lock Screen → Start screen saver: Never; Turn display off: Never
#   - System Settings → Battery / Energy Saver → Prevent sleep when display is off: ON
#   - System Settings → Software Update → set automatic updates so they install at 4am
#
# To uninstall:
#   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.jukboks.kiosk.plist
#   rm ~/Library/LaunchAgents/com.jukboks.kiosk.plist ~/.config/jukboks/kiosk-launch.sh ~/.config/jukboks/kiosk.env

set -e

BASE_URL="${JUKBOKS_BASE_URL:-https://jukboks.com}"
CONFIG_DIR="$HOME/.config/jukboks"
LAUNCHER="$CONFIG_DIR/kiosk-launch.sh"
ENV_FILE="$CONFIG_DIR/kiosk.env"
PLIST="$HOME/Library/LaunchAgents/com.jukboks.kiosk.plist"

echo "==> Installing jukboks Mac kiosk…"
mkdir -p "$CONFIG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

# 1) Download the launch wrapper.
echo "==> Fetching launcher from $BASE_URL/scripts/mac-kiosk-launch.sh"
curl -fsSL "$BASE_URL/scripts/mac-kiosk-launch.sh" -o "$LAUNCHER"
chmod +x "$LAUNCHER"

# 2) Prompt for venue code if env file doesn't exist.
if [ ! -f "$ENV_FILE" ]; then
  echo
  echo "What is your venue code? (the part after /kiosk/ in your kiosk URL)"
  echo "Example: will-s-B5yA5h"
  printf "Venue code: "
  read -r VENUE_CODE
  if [ -z "$VENUE_CODE" ]; then
    echo "ERROR: venue code cannot be empty. Aborting."
    exit 1
  fi
  # Whitelist: alphanumeric + dash + underscore. Prevents shell/URL injection
  # via crafted input like 'foo" --bad-flag "'.
  if ! printf '%s' "$VENUE_CODE" | grep -Eq '^[A-Za-z0-9_-]+$'; then
    echo "ERROR: venue code must contain only letters, numbers, dashes, and underscores."
    exit 1
  fi

  KIOSK_URL="$BASE_URL/kiosk/${VENUE_CODE}?autostart=true&reload=15&hardReload=30&memReloadMb=900&memHardReloadMb=1500"

  cat > "$ENV_FILE" <<EOF
# jukboks kiosk config.
# Edit KIOSK_URL to change which venue this Mac displays, then restart:
#   launchctl kickstart -k gui/\$(id -u)/com.jukboks.kiosk
export KIOSK_URL="$KIOSK_URL"
EOF
  echo "==> Wrote $ENV_FILE"
else
  echo "==> $ENV_FILE already exists, leaving it alone."
fi

# 3) Write the LaunchAgent plist.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jukboks.kiosk</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$LAUNCHER</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/jukboks-kiosk.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/jukboks-kiosk.log</string>
</dict>
</plist>
EOF
echo "==> Wrote $PLIST"

# 4) (Re)load it.
launchctl bootout "gui/$(id -u)/com.jukboks.kiosk" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/com.jukboks.kiosk"
echo "==> LaunchAgent loaded. Chrome should open in kiosk mode within a few seconds."

echo
echo "==============================================================="
echo "  Done. Next steps (one-time, in System Settings):"
echo
echo "  1. Users & Groups → Automatic login → enable for this user"
echo "  2. Lock Screen → Start Screen Saver: Never"
echo "  3. Lock Screen → Turn display off: Never (when on power)"
echo "  4. Battery / Energy → Prevent sleep when display is off: ON"
echo "  5. Battery / Energy → Start up automatically after a power failure: ON"
echo
echo "  To stop the kiosk:"
echo "    launchctl bootout gui/\$(id -u)/com.jukboks.kiosk"
echo
echo "  To restart Chrome (e.g. after editing KIOSK_URL):"
echo "    launchctl kickstart -k gui/\$(id -u)/com.jukboks.kiosk"
echo
echo "  Logs:"
echo "    tail -f ~/Library/Logs/jukboks-kiosk.log"
echo "==============================================================="
