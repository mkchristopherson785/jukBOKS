#!/bin/bash
# One-line installer for the jukboks Mac audio agent.
#   curl -fsSL https://jukboks.com/scripts/install-mac-audio-agent.sh | bash
#
# Installs:
#   - Homebrew (if missing) — required to install switchaudio-osx
#   - switchaudio-osx — CLI for switching macOS audio output devices
#   - ~/.config/jukboks/audio-agent.sh — the agent loop
#   - ~/.config/jukboks/audio-agent.env — config (venue code)
#   - ~/Library/LaunchAgents/com.jukboks.audio-agent.plist — auto-runs at login
#
# After install, the admin Venues page will list your Mac's audio outputs
# (HDMI, Headphones, AirPlay receivers, USB speakers, etc.) in the Audio
# Output dropdown — selecting one switches it remotely within ~60s.

set -e

BASE_URL="${JUKBOKS_BASE_URL:-https://jukboks.com}"
CONFIG_DIR="$HOME/.config/jukboks"
AGENT="$CONFIG_DIR/audio-agent.sh"
ENV_FILE="$CONFIG_DIR/audio-agent.env"
PLIST="$HOME/Library/LaunchAgents/com.jukboks.audio-agent.plist"

echo "==> Installing jukboks Mac audio agent…"
mkdir -p "$CONFIG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

# 1) Ensure Homebrew is installed (needed for switchaudio-osx).
if ! command -v brew >/dev/null 2>&1; then
  echo
  echo "==> Homebrew not found. Installing it now…"
  echo "    (You'll be prompted for your Mac password — this is normal.)"
  echo
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for this shell (Apple Silicon vs Intel).
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# 2) Install switchaudio-osx if missing.
if ! command -v SwitchAudioSource >/dev/null 2>&1; then
  echo "==> Installing switchaudio-osx via Homebrew…"
  brew install switchaudio-osx
else
  echo "==> switchaudio-osx already installed."
fi

# 3) Download the agent script.
echo "==> Fetching agent from $BASE_URL/scripts/mac-audio-agent.sh"
curl -fsSL "$BASE_URL/scripts/mac-audio-agent.sh" -o "$AGENT"
chmod +x "$AGENT"

# 4) Prompt for venue code if env file doesn't exist. Try to reuse the venue
# code from the kiosk installer's config if it exists.
if [ ! -f "$ENV_FILE" ]; then
  PREFILLED_CODE=""
  KIOSK_ENV="$CONFIG_DIR/kiosk.env"
  if [ -f "$KIOSK_ENV" ]; then
    # Grep KIOSK_URL and extract the venue code (between /kiosk/ and ?).
    PREFILLED_CODE="$(grep -o 'kiosk/[A-Za-z0-9_-]*' "$KIOSK_ENV" | head -1 | sed 's|kiosk/||')"
  fi

  if [ -n "$PREFILLED_CODE" ]; then
    echo "==> Detected venue code from kiosk install: $PREFILLED_CODE"
    VENUE_CODE="$PREFILLED_CODE"
  else
    echo
    echo "What is your venue code? (the part after /kiosk/ in your kiosk URL)"
    echo "Example: will-s-B5yA5h"
    printf "Venue code: "
    read -r VENUE_CODE < /dev/tty
    if [ -z "$VENUE_CODE" ]; then
      echo "ERROR: venue code cannot be empty. Aborting."
      exit 1
    fi
    if ! printf '%s' "$VENUE_CODE" | grep -Eq '^[A-Za-z0-9_-]+$'; then
      echo "ERROR: venue code must contain only letters, numbers, dashes, and underscores."
      exit 1
    fi
  fi

  cat > "$ENV_FILE" <<EOF
# jukboks Mac audio agent config.
export VENUE_CODE="$VENUE_CODE"
export BASE_URL="$BASE_URL"
EOF
  echo "==> Wrote $ENV_FILE"
else
  echo "==> $ENV_FILE already exists, leaving it alone."
fi

# 5) Write the LaunchAgent plist.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jukboks.audio-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$AGENT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/jukboks-audio-agent.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/jukboks-audio-agent.log</string>
</dict>
</plist>
EOF
echo "==> Wrote $PLIST"

# 6) (Re)load it.
launchctl bootout "gui/$(id -u)/com.jukboks.audio-agent" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/com.jukboks.audio-agent"
echo "==> Audio agent loaded. Within 60s your Mac's outputs will appear in the admin Venues page."

echo
echo "==============================================================="
echo "  Done. From the admin Venues page → click the venue card →"
echo "  the 'Audio Output' dropdown will list your Mac's outputs"
echo "  (HDMI, Headphones, AirPlay, USB speakers, etc.)."
echo "  Switching takes effect within ~60s."
echo
echo "  Logs:"
echo "    tail -f ~/Library/Logs/jukboks-audio-agent.log"
echo
echo "  To stop the agent:"
echo "    launchctl bootout gui/\$(id -u)/com.jukboks.audio-agent"
echo "==============================================================="
