#!/usr/bin/env python3
import http.server
import json
import subprocess
import urllib.parse
import os
import signal
import sys
import time

CONFIG_PATH = "/etc/jukboks/config.json"
PORTAL_PORT = 80

def scan_wifi():
    try:
        result = subprocess.run(
            ["iwlist", "wlan0", "scan"],
            capture_output=True, text=True, timeout=15
        )
        networks = []
        seen = set()
        for line in result.stdout.split("\n"):
            line = line.strip()
            if line.startswith("ESSID:"):
                ssid = line.split('"')[1] if '"' in line else ""
                if ssid and ssid not in seen:
                    networks.append(ssid)
                    seen.add(ssid)
        return sorted(networks)
    except Exception:
        return []

def save_config(data):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=2)

def load_config():
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def configure_wifi(ssid, password):
    wpa_conf = f'''
country=US
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={{
    ssid="{ssid}"
    psk="{password}"
    key_mgmt=WPA-PSK
}}
'''
    with open("/etc/wpa_supplicant/wpa_supplicant.conf", "w") as f:
        f.write(wpa_conf)

SETUP_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>Jukboks Setup</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%);
  min-height: 100vh;
  color: #fff;
  padding: 20px;
}
.container {
  max-width: 400px;
  margin: 0 auto;
  padding-top: 40px;
}
.logo {
  text-align: center;
  margin-bottom: 32px;
}
.logo-icon {
  width: 72px;
  height: 72px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 36px;
}
.logo h1 {
  font-size: 28px;
  font-weight: 700;
}
.logo p {
  color: #9ca3af;
  font-size: 14px;
  margin-top: 4px;
}
.card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 16px;
}
.card h2 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #c4b5fd;
}
label {
  display: block;
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 6px;
  font-weight: 500;
}
select, input[type="text"], input[type="password"] {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  color: #fff;
  font-size: 15px;
  margin-bottom: 16px;
  outline: none;
  -webkit-appearance: none;
}
select:focus, input:focus {
  border-color: #6366f1;
}
select option { background: #1a1a2e; color: #fff; }
.field-hint {
  font-size: 11px;
  color: #6b7280;
  margin-top: -12px;
  margin-bottom: 16px;
}
.btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn:hover { opacity: 0.9; }
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-scan {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  padding: 10px;
  font-size: 13px;
  margin-bottom: 16px;
}
.status {
  text-align: center;
  padding: 20px;
  display: none;
}
.status.active { display: block; }
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #a855f7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.success-icon {
  width: 48px;
  height: 48px;
  background: #22c55e;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  font-size: 24px;
}
.error { color: #f87171; font-size: 13px; margin-top: -8px; margin-bottom: 12px; }
.step-indicator {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}
.step {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
}
.step.active { background: #a855f7; }
.step.done { background: #22c55e; }
.audio-select {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.audio-option {
  flex: 1;
  padding: 10px 8px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  text-align: center;
  cursor: pointer;
  font-size: 12px;
  color: #9ca3af;
  transition: all 0.2s;
}
.audio-option.selected {
  border-color: #6366f1;
  background: rgba(99,102,241,0.15);
  color: #fff;
}
</style>
</head>
<body>
<div class="container">
  <div class="logo">
    <div class="logo-icon">&#9835;</div>
    <h1>Jukboks</h1>
    <p>Kiosk Setup</p>
  </div>

  <div class="step-indicator">
    <div class="step active" id="step1"></div>
    <div class="step" id="step2"></div>
    <div class="step" id="step3"></div>
  </div>

  <form id="setupForm">
    <div id="page1">
      <div class="card">
        <h2>1. Connect to WiFi</h2>
        <label>WiFi Network</label>
        <select id="wifiNetwork" name="ssid">
          <option value="">Scanning...</option>
        </select>
        <button type="button" class="btn btn-scan" onclick="refreshNetworks()">Scan Again</button>
        <label>WiFi Password</label>
        <input type="password" id="wifiPassword" name="password" placeholder="Enter WiFi password">
        <div id="wifiError" class="error" style="display:none"></div>
      </div>
      <button type="button" class="btn" onclick="nextPage(2)">Next</button>
    </div>

    <div id="page2" style="display:none">
      <div class="card">
        <h2>2. Venue Settings</h2>
        <label>Jukboks URL</label>
        <input type="text" id="appUrl" name="url" placeholder="https://your-app.replit.app">
        <p class="field-hint">Your published Jukboks app URL</p>
        <label>Venue Code</label>
        <input type="text" id="venueCode" name="venue_code" placeholder="e.g. MYBAR">
        <p class="field-hint">Found in your venue settings</p>
      </div>
      <button type="button" class="btn" onclick="nextPage(3)">Next</button>
    </div>

    <div id="page3" style="display:none">
      <div class="card">
        <h2>3. Display & Audio</h2>
        <label>Display Layout</label>
        <div class="audio-select">
          <div class="audio-option selected" data-value="square" onclick="selectLayout(this)">Square</div>
          <div class="audio-option" data-value="default" onclick="selectLayout(this)">Widescreen</div>
        </div>
        <label>Audio Output</label>
        <div class="audio-select">
          <div class="audio-option selected" data-value="auto" onclick="selectAudio(this)">Auto</div>
          <div class="audio-option" data-value="hdmi" onclick="selectAudio(this)">HDMI</div>
          <div class="audio-option" data-value="headphone" onclick="selectAudio(this)">3.5mm</div>
        </div>
      </div>
      <button type="button" class="btn" onclick="submitSetup()">Complete Setup</button>
    </div>
  </form>

  <div id="connecting" class="status">
    <div class="spinner"></div>
    <p>Connecting to WiFi and configuring kiosk...</p>
    <p style="color:#9ca3af;font-size:13px;margin-top:8px">This may take up to 30 seconds</p>
  </div>

  <div id="success" class="status">
    <div class="success-icon">&#10003;</div>
    <h2 style="margin-bottom:8px">Setup Complete!</h2>
    <p style="color:#9ca3af;font-size:14px;margin-bottom:16px">Your kiosk is rebooting now. It will start playing automatically.</p>
    <p style="color:#6b7280;font-size:12px">You can disconnect from "Jukboks-Setup" WiFi</p>
  </div>

  <div id="failure" class="status">
    <p style="color:#f87171;font-size:16px;font-weight:600;margin-bottom:8px">Setup Failed</p>
    <p id="failureMsg" style="color:#9ca3af;font-size:14px;margin-bottom:16px"></p>
    <button class="btn" onclick="location.reload()">Try Again</button>
  </div>
</div>

<script>
let selectedLayout = 'square';
let selectedAudio = 'auto';

function selectLayout(el) {
  document.querySelectorAll('[onclick^="selectLayout"]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedLayout = el.dataset.value;
}
function selectAudio(el) {
  document.querySelectorAll('[onclick^="selectAudio"]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedAudio = el.dataset.value;
}

function nextPage(page) {
  if (page === 2) {
    const ssid = document.getElementById('wifiNetwork').value;
    const pass = document.getElementById('wifiPassword').value;
    if (!ssid) {
      document.getElementById('wifiError').textContent = 'Please select a WiFi network';
      document.getElementById('wifiError').style.display = 'block';
      return;
    }
    document.getElementById('wifiError').style.display = 'none';
  }
  if (page === 3) {
    const url = document.getElementById('appUrl').value.trim();
    const code = document.getElementById('venueCode').value.trim();
    if (!url || !code) { alert('Please fill in both fields'); return; }
  }
  document.getElementById('page1').style.display = page === 1 ? 'block' : 'none';
  document.getElementById('page2').style.display = page === 2 ? 'block' : 'none';
  document.getElementById('page3').style.display = page === 3 ? 'block' : 'none';
  document.getElementById('step1').className = 'step ' + (page >= 1 ? (page > 1 ? 'done' : 'active') : '');
  document.getElementById('step2').className = 'step ' + (page >= 2 ? (page > 2 ? 'done' : 'active') : '');
  document.getElementById('step3').className = 'step ' + (page >= 3 ? 'active' : '');
}

function refreshNetworks() {
  const sel = document.getElementById('wifiNetwork');
  sel.innerHTML = '<option value="">Scanning...</option>';
  fetch('/api/scan')
    .then(r => r.json())
    .then(data => {
      sel.innerHTML = '<option value="">Select network...</option>';
      data.networks.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        sel.appendChild(opt);
      });
    })
    .catch(() => {
      sel.innerHTML = '<option value="">Scan failed - try again</option>';
    });
}

function submitSetup() {
  const data = {
    ssid: document.getElementById('wifiNetwork').value,
    password: document.getElementById('wifiPassword').value,
    url: document.getElementById('appUrl').value.trim().replace(/\/$/, ''),
    venue_code: document.getElementById('venueCode').value.trim(),
    layout: selectedLayout,
    audio: selectedAudio
  };

  document.getElementById('page3').style.display = 'none';
  document.getElementById('connecting').classList.add('active');
  document.querySelectorAll('.step').forEach(s => s.className = 'step done');

  fetch('/api/setup', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  })
  .then(r => r.json())
  .then(result => {
    document.getElementById('connecting').classList.remove('active');
    if (result.success) {
      document.getElementById('success').classList.add('active');
    } else {
      document.getElementById('failureMsg').textContent = result.error || 'Unknown error';
      document.getElementById('failure').classList.add('active');
    }
  })
  .catch(() => {
    document.getElementById('connecting').classList.remove('active');
    document.getElementById('success').classList.add('active');
  });
}

refreshNetworks();
</script>
</body>
</html>'''


class SetupHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[Portal] {args[0]}")

    def do_GET(self):
        if self.path == "/api/scan":
            networks = scan_wifi()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"networks": networks}).encode())
        elif self.path == "/api/status":
            config = load_config()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"configured": bool(config.get("venue_code"))}).encode())
        elif self.path == "/generate_204" or self.path == "/gen_204":
            self.send_response(302)
            self.send_header("Location", "http://192.168.4.1/")
            self.end_headers()
        elif self.path == "/hotspot-detect.html" or self.path == "/library/test/success.html":
            self.send_response(302)
            self.send_header("Location", "http://192.168.4.1/")
            self.end_headers()
        elif self.path == "/connecttest.txt" or self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "http://192.168.4.1/")
            self.end_headers()
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(SETUP_HTML.encode())

    def do_POST(self):
        if self.path == "/api/setup":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                ssid = data.get("ssid", "")
                password = data.get("password", "")
                url = data.get("url", "").rstrip("/")
                venue_code = data.get("venue_code", "")
                layout = data.get("layout", "square")
                audio = data.get("audio", "auto")

                if not ssid or not url or not venue_code:
                    self.send_json({"success": False, "error": "Missing required fields"})
                    return

                config = {
                    "ssid": ssid,
                    "url": url,
                    "venue_code": venue_code,
                    "layout": layout,
                    "audio": audio,
                    "configured": True
                }
                save_config(config)

                configure_wifi(ssid, password)

                kiosk_url = f"{url}/kiosk/{venue_code}?autostart=true&layout={layout}"
                subprocess.run([
                    "/usr/local/bin/jukboks-apply-config",
                    kiosk_url, audio
                ], timeout=10)

                self.send_json({"success": True})

                def delayed_reboot():
                    time.sleep(3)
                    subprocess.run(["sudo", "reboot"])
                import threading
                threading.Thread(target=delayed_reboot, daemon=True).start()

            except Exception as e:
                self.send_json({"success": False, "error": str(e)})
        else:
            self.send_response(404)
            self.end_headers()

    def send_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def main():
    print(f"[Portal] Starting Jukboks setup portal on port {PORTAL_PORT}")
    server = http.server.HTTPServer(("0.0.0.0", PORTAL_PORT), SetupHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()

if __name__ == "__main__":
    main()
