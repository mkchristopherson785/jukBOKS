#!/bin/bash
HOTSPOT_SSID="Jukboks-Setup"
HOTSPOT_PASS="jukboks123"
CONFIG_PATH="/etc/jukboks/config.json"
AP_IP="192.168.4.1"

start_hotspot() {
  echo "[WiFi Manager] Starting setup hotspot: $HOTSPOT_SSID"

  systemctl stop wpa_supplicant 2>/dev/null || true
  systemctl stop dhcpcd 2>/dev/null || true
  ip link set wlan0 down
  ip addr flush dev wlan0
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
  ip addr flush dev wlan0
}

check_wifi_connection() {
  for i in $(seq 1 30); do
    if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

main() {
  echo "[WiFi Manager] Jukboks WiFi Manager starting..."

  if [ -f "$CONFIG_PATH" ] && python3 -c "import json; c=json.load(open('$CONFIG_PATH')); exit(0 if c.get('configured') else 1)" 2>/dev/null; then
    echo "[WiFi Manager] Configuration found, attempting WiFi connection..."
    systemctl start wpa_supplicant 2>/dev/null || true
    systemctl start dhcpcd 2>/dev/null || true

    if check_wifi_connection; then
      echo "[WiFi Manager] WiFi connected successfully!"
      exit 0
    else
      echo "[WiFi Manager] WiFi connection failed, starting setup hotspot..."
    fi
  else
    echo "[WiFi Manager] No configuration found, starting setup hotspot..."
  fi

  stop_hotspot
  start_hotspot

  while true; do
    sleep 60
  done
}

main "$@"
