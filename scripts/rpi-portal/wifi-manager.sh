#!/bin/bash
HOTSPOT_SSID="Jukboks-Setup"
HOTSPOT_PASS="jukboks123"
CONFIG_PATH="/etc/jukboks/config.json"
AP_IP="192.168.4.1"

has_nm() {
  command -v nmcli >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^NetworkManager.service"
}

stop_network_managers() {
  if has_nm; then
    echo "[WiFi Manager] Stopping NetworkManager (AP mode)..."
    nmcli radio wifi off 2>/dev/null || true
    systemctl stop NetworkManager 2>/dev/null || true
  fi
  systemctl stop wpa_supplicant 2>/dev/null || true
  systemctl stop dhcpcd 2>/dev/null || true
  rfkill unblock wifi 2>/dev/null || true
  sleep 1
}

start_hotspot() {
  echo "[WiFi Manager] Starting setup hotspot: $HOTSPOT_SSID"

  stop_network_managers

  ip link set wlan0 down 2>/dev/null || true
  ip addr flush dev wlan0 2>/dev/null || true
  ip link set wlan0 up
  ip addr add ${AP_IP}/24 dev wlan0

  cat > /tmp/hostapd.conf << EOF
interface=wlan0
driver=nl80211
ssid=${HOTSPOT_SSID}
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${HOTSPOT_PASS}
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF

  cat > /tmp/dnsmasq-portal.conf << EOF
interface=wlan0
bind-interfaces
dhcp-range=192.168.4.10,192.168.4.50,255.255.255.0,24h
address=/#/${AP_IP}
EOF

  hostapd -B /tmp/hostapd.conf
  sleep 2
  dnsmasq -C /tmp/dnsmasq-portal.conf

  iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination ${AP_IP}:80
  iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 -j DNAT --to-destination ${AP_IP}:80

  python3 /opt/jukboks/portal.py &
  echo $! > /tmp/jukboks-portal.pid

  echo "[WiFi Manager] Hotspot active. Connect to '$HOTSPOT_SSID' (password: $HOTSPOT_PASS)"
}

stop_hotspot() {
  echo "[WiFi Manager] Stopping hotspot..."
  if [ -f /tmp/jukboks-portal.pid ]; then
    kill $(cat /tmp/jukboks-portal.pid) 2>/dev/null
    rm /tmp/jukboks-portal.pid
  fi
  killall hostapd 2>/dev/null || true
  killall dnsmasq 2>/dev/null || true
  iptables -t nat -F 2>/dev/null || true
  ip addr flush dev wlan0 2>/dev/null || true
}

check_wifi_connection() {
  local timeout="${1:-30}"
  for i in $(seq 1 "$timeout"); do
    if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

connect_via_nm() {
  local ssid="$1"
  local password="$2"
  echo "[WiFi Manager] Connecting via NetworkManager to '$ssid'..."
  systemctl start NetworkManager 2>/dev/null || true
  sleep 3
  nmcli radio wifi on 2>/dev/null || true
  sleep 2
  if [ -z "$password" ]; then
    echo "[WiFi Manager] No password saved for '$ssid', skipping nmcli connect."
    return 1
  fi
  nmcli connection delete "$ssid" 2>/dev/null || true
  if nmcli device wifi connect "$ssid" password "$password" ifname wlan0 2>&1; then
    return 0
  fi
  return 1
}

connect_legacy() {
  echo "[WiFi Manager] Connecting via wpa_supplicant/dhcpcd..."
  systemctl start wpa_supplicant 2>/dev/null || true
  systemctl start dhcpcd 2>/dev/null || true
}

main() {
  echo "[WiFi Manager] Jukboks WiFi Manager starting..."

  CONFIGURED=false
  SAVED_SSID=""
  SAVED_PASS=""
  if [ -f "$CONFIG_PATH" ] && python3 -c "import json; c=json.load(open('$CONFIG_PATH')); exit(0 if c.get('configured') else 1)" 2>/dev/null; then
    CONFIGURED=true
    SAVED_SSID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH')).get('ssid',''))" 2>/dev/null)
    SAVED_PASS=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH')).get('password',''))" 2>/dev/null)
  fi

  if [ "$CONFIGURED" = false ]; then
    echo "[WiFi Manager] No configuration found, starting setup hotspot..."
    stop_hotspot
    start_hotspot
    while true; do sleep 60; done
  fi

  # Let NetworkManager auto-connect to any saved profile first.
  if has_nm; then
    systemctl start NetworkManager 2>/dev/null || true
    nmcli radio wifi on 2>/dev/null || true
    echo "[WiFi Manager] Waiting up to 20s for NetworkManager to auto-connect..."
    if check_wifi_connection 20; then
      echo "[WiFi Manager] Already online via saved network, done."
      exit 0
    fi
  fi

  # Not online yet — try our saved Jukboks credentials.
  if [ -n "$SAVED_SSID" ]; then
    if has_nm; then
      connect_via_nm "$SAVED_SSID" "$SAVED_PASS"
    else
      connect_legacy
    fi
    if check_wifi_connection 20; then
      echo "[WiFi Manager] WiFi connected successfully!"
      exit 0
    fi
  fi

  echo "[WiFi Manager] Could not get online, falling back to setup hotspot..."
  stop_hotspot
  start_hotspot
  while true; do sleep 60; done
}

main "$@"
