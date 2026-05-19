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

# 2) Determine venue code + headless mode. If env file exists, reuse the
#    venue code and headless flag from the existing KIOSK_URL — but always
#    rewrite the rest of the URL params from this script's defaults so a
#    re-install picks up new memory thresholds, reload cadence, etc.
VENUE_CODE=""
EXTRA_PARAMS=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_URL="$(grep -E '^export KIOSK_URL=' "$ENV_FILE" 2>/dev/null | sed -E 's/^export KIOSK_URL="?([^"]*)"?$/\1/' | head -1)"
  # Extract venue code from /kiosk/<code>?...
  VENUE_CODE="$(printf '%s' "$EXISTING_URL" | sed -nE 's|.*/kiosk/([A-Za-z0-9_-]+).*|\1|p')"
  # Preserve headless mode if previously set.
  if printf '%s' "$EXISTING_URL" | grep -q 'audioOnly=1'; then
    EXTRA_PARAMS="&audioOnly=1"
  fi
  if [ -n "$VENUE_CODE" ]; then
    echo
    echo "==> Found existing config for venue: $VENUE_CODE"
    [ -n "$EXTRA_PARAMS" ] && echo "    (headless mode is currently ON)"
    printf "Keep this venue? [Y/n]: "
    read -r KEEP_VENUE < /dev/tty
    case "${KEEP_VENUE:-}" in
      n|N|no|NO|No)
        echo "==> Switching venues — you'll be prompted for the new code below."
        VENUE_CODE=""
        EXTRA_PARAMS=""
        ;;
      *)
        echo "==> Keeping venue $VENUE_CODE. URL params will be refreshed from this installer's defaults."
        ;;
    esac
  fi
fi

if [ -z "$VENUE_CODE" ]; then
  echo
  echo "What is your venue code? (the part after /kiosk/ in your kiosk URL)"
  echo "Example: will-s-B5yA5h"
  printf "Venue code: "
  # Read from /dev/tty (the actual terminal), not stdin — stdin is the piped
  # script body when this is run via `curl | bash`.
  read -r VENUE_CODE < /dev/tty
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

  echo
  echo "Is this Mac headless? (no monitor — audio only, with the visual"
  echo "display shown on a separate device like a TV stick or tablet)"
  printf "Headless? [y/N]: "
  read -r HEADLESS_ANSWER < /dev/tty
  case "${HEADLESS_ANSWER:-}" in
    y|Y|yes|YES|Yes)
      EXTRA_PARAMS="&audioOnly=1"
      echo "==> Headless mode: audio only (open the Display URL on a separate device)."
      echo "    Display URL: $BASE_URL/kiosk/${VENUE_CODE}?display=true"
      ;;
    *)
      echo "==> Standard mode: full kiosk display + audio."
      ;;
  esac
fi

KIOSK_URL="$BASE_URL/kiosk/${VENUE_CODE}?autostart=true&reload=15&hardReload=30&memReloadMb=700&memHardReloadMb=1100${EXTRA_PARAMS}"

cat > "$ENV_FILE" <<EOF
# jukboks kiosk config.
# Edit KIOSK_URL to change which venue this Mac displays, then restart:
#   launchctl kickstart -k gui/\$(id -u)/com.jukboks.kiosk
export KIOSK_URL="$KIOSK_URL"
EOF
echo "==> Wrote $ENV_FILE"

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
echo
echo "  To switch between headless and full-display modes later, edit"
echo "  ~/.config/jukboks/kiosk.env (add or remove '&audioOnly=1' at the"
echo "  end of KIOSK_URL), then run the kickstart command above."
echo "==============================================================="
