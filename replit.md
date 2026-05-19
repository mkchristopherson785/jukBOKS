# Jukboks - Community Music Request Platform

## Overview
Jukboks is a SaaS platform for bars, restaurants, and event venues. Guests scan a QR code to request and vote on songs; the venue runs a kiosk that plays the unified queue through the venue speakers. Multi-tenant: organizations → venues → party sessions → guests.

## User Preferences
I prefer detailed explanations of complex technical decisions. Propose the high-level approach and key components before diving into coding. For critical architectural changes, ask for approval first. Code should be well-documented and follow modern TypeScript/React best practices.

## Tech Stack
- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, Vite, TailwindCSS, shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM
- **Music**: Apple Music API (MusicKit JS) for full playback; iTunes Search API for search/previews
- **Auth**: Replit Auth (Google, Apple, email/password) for owners; token-based for guests and Integration API
- **Mobile**: Native iOS app via Capacitor (dual Host/Guest modes, bottom tab nav)

## Core Features

### Party / Guest Experience
- **QR Code access** — guests join a party without creating an account
- **Search** — by song title (default) or artist (toggle pills above the search box). Server proxies iTunes search with `attribute=songTerm` / `attribute=artistTerm` whitelisted
- **Unified queue** — guest requests blended with auto-play from backup playlists
- **Upvote/downvote** — guests influence queue order
- **Smart repetition prevention** — configurable per-song / per-artist cooldowns
- **Guest favorites** — cloud-synced per-venue, keyed by guest name. `GET/POST /api/v1/venues/:code/favorites`, `DELETE .../:trackId`. One-time localStorage migration for legacy favorites
- **Song details modal** — Info button on every song row opens `SongDetailsDialog` with album art, metadata, 30s preview, Apple Music link, and "You might also like" similar songs (artist-based, deduped). Backed by `GET /api/v1/tracks/:trackId` and `.../similar`, server-cached 24h with bounded LRU. Inline "+" buttons request similar songs directly
- **Listen Along (time sync)** — guests stream the venue's current song through their own Apple Music subscription, starting at the venue's playback position. `/api/v1/party/:partyCode` returns `nowPlaying.startedAt`, `nowPlaying.duration`, and top-level `serverNow` to cancel clock skew. Client computes `(serverNow − startedAt) + (Date.now() − __receivedAtMs)`, calls `seekToTime` after `play()`, and re-syncs every 15s if drift > 2s
- **Guest ranking / gamification** — ranks earned from upvotes received: Wallflower (0-9), Crowd Pleaser (10-29), Vibe Curator (30-74), Beat Dropper (75-149), Hitmaker (150-299), Jukebox Hero (300+). Logic in `shared/ranks.ts`. Components: `GuestRankBadge` (inline next to requester names), `GuestRankCard` (with progress bar). Aggregated server-side via `getGuestRankings()`; case-insensitive name matching

### Admin
- **Queue management** — approve/reject requests, remove songs, skip current
- **Mobile host quick actions** — skip, clear queue, live listener count
- **Venue analytics** — total songs played, unique guests, peak hours
- **Venue branding** — custom CSS properties for primary color
- **Announcement groups** — scheduled audio announcements with optional cover image (`announcements.image_url`, max 10 MB upload). Each row has a Test button (`POST /api/me/venues/:venueId/announcements/:announcementId/test`)
- **Urgent announcements** — `POST /api/v1/venues/:code/announce` interrupts current song and plays twice. Supports TTS (browser SpeechSynthesis) or pre-recorded audio URL. Optional `imageUrl` (also stored as `urgent_announcement_image_url` on venues)
- **Integration API** — API key management UI in Settings; authenticated endpoints for external platforms (LivHOA): search, list venues, play history, request, vote, urgent announce, track details/similar. Keys shown once, then masked. Documented at `docs/INTEGRATION_API.md`. Queue + history endpoints include `requesterRank` per song

### Kiosk
- **Display modes** (URL params on `/kiosk/:code`):
  - default: full kiosk (audio + visuals, claims device lock, heartbeats)
  - `?display=true`: visuals only (no audio, no lock, no heartbeat — multi-TV safe)
  - `?audioOnly=1`: audio + logic only (no album art / animations / QR / queue list / logo). Renders a small health diagnostics panel so a tech plugging in a monitor sees CPU/mem/disk/uptime live. Implies autostart
  - `?layout=square` for 1:1 displays; admin can also set `venues.kioskLayout` (Landscape 16:9 / Square 1:1) which wins over URL param
- **Device locking + heartbeat** — only one device plays audio per venue. "Playback Locked" screen on the loser shows a "Play here instead" button (`POST /api/v1/venues/:code/kiosk-release`)
- **Scheduled playback** — kiosk only plays during configured hours
- **Headless Apple Music pairing** — kiosk shows a 6-digit code (`POST /api/v1/venues/:code/pairing-code`, 10-min TTL, in-memory). Owner enters it at `/pair` on phone after authorizing MusicKit; resulting `musicUserToken` is POSTed to `/api/me/pair`, saved to `venues.appleMusicUserToken`. Kiosk polls `GET .../apple-music-token` every 30s and applies it via `applyMusicUserToken` (no popup, no user gesture). `/api/me/venues` strips the raw token and returns `appleMusicConnected` boolean. Disconnect via `DELETE /api/me/venues/:venueId/apple-music-token`

### VenuesPage Admin Card
- **Display Layout** dropdown (writes `kioskLayout`)
- **Audio Output** dropdown (writes `kioskAudioSink`) — sinks reported by the audio agent
- **Volume slider** (writes `kioskAudioVolume`, 0-100, default 65 to prevent amp clipping)
- **Apple Music** connect/disconnect
- **Restart Kiosk Browser** — stamps `kiosk_restart_requested_at`. Audio agent's `/audio-sink` poll returns `restartRequested: true` (only honored within a 2-min window so an offline agent can't restart hours later), agent acks via `POST .../restart-ack` and kills the browser. Kiosk autostart relaunches a fresh tab. Owner-only
- **Pi/Mac System Health card** — CPU temp, memory %, Chromium RSS + uptime, disk %, system uptime, heartbeat age. Thresholds: CPU ≥70°C amber / ≥80°C red; mem ≥75% / ≥90%; Chromium ≥1000 MB / ≥1500 MB. Falls back to "agent not installed" when no data

## Mac Kiosk (recommended platform)

Intel or Apple Silicon Mac mini (or any old Mac) running macOS Chrome. Avoids the ARM Chromium per-tab memory ceiling that causes "Aw Snap" on Raspberry Pi. Two installers, both no-sudo for the user side (Homebrew install does prompt for the Mac password):

### Kiosk install
```
curl -fsSL https://jukboks.com/scripts/install-mac-kiosk.sh | bash
```
- Prompts for venue code (and headless y/N — adds `&audioOnly=1`)
- Writes `~/.config/jukboks/kiosk.env` and `~/.config/jukboks/kiosk-launch.sh`
- Installs LaunchAgent `~/Library/LaunchAgents/com.jukboks.kiosk.plist` (RunAtLoad + KeepAlive)
- Launch script wraps `chrome --kiosk --app=URL` in a while-loop so any Chrome exit relaunches within 3s
- Default URL params: `?autostart=true&reload=15&hardReload=30&memReloadMb=700&memHardReloadMb=1100` (JS heap, not full RSS — leaves headroom for any single song while catching real leaks before the renderer dies)
- After install, user enables Automatic Login + Prevent Sleep in System Settings
- Restart Chrome: `launchctl kickstart -k gui/$(id -u)/com.jukboks.kiosk`
- Logs: `~/Library/Logs/jukboks-kiosk.log`

### Audio agent install
```
curl -fsSL https://jukboks.com/scripts/install-mac-audio-agent.sh | bash
```
- Auto-installs Homebrew (writes the brew installer to a temp file and runs it with `< /dev/tty` so sudo can prompt — `curl | bash` strips stdin, breaking interactive sudo otherwise) and `switchaudio-osx`
- Reuses venue code from kiosk install if present
- LaunchAgent `~/Library/LaunchAgents/com.jukboks.audio-agent.plist` (RunAtLoad + KeepAlive)
- Loop (60s): lists outputs via `SwitchAudioSource -a -t output`, POSTs to `/audio-devices`, polls `/audio-sink` for desired sink + volume + restart flag + playback backend, applies sink via `SwitchAudioSource -t output -s`, volume via `osascript -e "set volume output volume X"`. Also POSTs system health (load avg, mem%, disk%, uptime, Chrome RSS+uptime) to `/health`. CPU temp reported as null (requires sudo on macOS)
- **Fast inner loop (1s)** runs between each 60s tick. When `playback_backend = apple_music_native`, calls `GET /playback-state` and drives Music.app via AppleScript (see "Native Apple Music backend" below). Idle when backend = musickit_js
- Logs: `~/Library/Logs/jukboks-audio-agent.log`
- Stable per-Mac deviceId: `~/.config/jukboks/device-id`

## Native Apple Music backend (Option A)

Bypasses MusicKit JS entirely by playing through the macOS Music.app, which doesn't suffer the renderer-side native-audio-buffer leak. Admin toggles `venues.playbackBackend` from `musickit_js` (default) to `apple_music_native` in the VenuesPage dropdown.

When native:
- **Kiosk page** unmounts `MusicKitPlayer` (no browser audio, no MusicKit init, no pairing flow). Still owns queue advancement — schedules `handleSongEnded` via `setTimeout(duration*1000 - 250ms)` per track. Visuals (album art, queue, QR) render normally
- **Mac audio agent** polls `GET /api/v1/venues/:code/playback-state` every 1s. When server's `nowPlaying.catalogId` differs from `AM_DESIRED_ID`, runs `open https://music.apple.com/us/song/_/<id>` to start the track, then `tell application "Music" to set song repeat to one` so a brief stall doesn't fall into Apple's algorithmic Up Next. Reports observed state via `POST /playback-report`. Volume applied via `tell application "Music" to set sound volume to N` (separate from system output volume)
- **Inter-song gap**: bounded by agent poll + AppleScript latency ≈ 1-2s
- **One-time macOS prompt**: first track triggers an "audio-agent wants to control Music" Automation permission dialog. Approve in System Settings → Privacy & Security → Automation
- **Endpoints**: `GET /api/v1/venues/:code/playback-state` (returns backend, nowPlaying, nextUp, volume, serverNow) and `POST /api/v1/venues/:code/playback-report` (agent persists observed state). Venue-code-gated, same trust model as `/audio-sink`
- **Caveat**: `?audioOnly=1` URL mode still mounts MusicKitPlayer in the audio-only diagnostic view; if user has audioOnly + native combined the diagnostic view skips MusicKitPlayer too. Pi installs unaffected — Pi agent doesn't have the AppleScript driver

## Renderer-crash and memory defenses (apply to both Mac and Pi)

MusicKit JS slowly leaks renderer memory; Chrome eventually shows "Aw Snap" but the parent process stays alive, so a `pkill` wrapper alone won't recover. Layered defenses:

1. **Server-side stale-heartbeat detection** — if `kiosk_lock_heartbeat` is >3min stale, `GET /api/v1/venues/:code/audio-sink` stamps `kioskRestartRequestedAt` and returns `restartRequested: true` to the agent. Same path as the manual "Restart Kiosk Browser" button. 5-min cooldown prevents loops
2. **Agent-side process-RSS watchdog** — every ~30s, restart browser when RSS exceeds `CHROMIUM_MAX_MB` (default 2500, polite — only when no sink is RUNNING) or `CHROMIUM_HARD_MAX_MB` (default 3000, even mid-song). 30-min cooldown. Set either to 0 to disable. Per-Pi overrides via systemd drop-in
3. **KioskPage memory watchdog** — five optional URL-param triggers, all set to 0 to disable:
   - `?reload=N` — polite reload after N min only between songs (default 30, min 5)
   - `?hardReload=N` — force reload after N min regardless of playback (default 60)
   - `?songsPerReload=N` — reload after N song-changes (cleanest; always at song boundary)
   - `?memReloadMb=N` — polite reload when JS heap exceeds N MB (between songs)
   - `?memHardReloadMb=N` — force reload when heap exceeds N MB
4. **Skip-cascade prevention** — `MusicKitPlayer` has a single shared `throttledOnEnded` (5s minimum between auto-advances) and requires the track to actually reach `playing` state before honoring `ended`/`completed`. Preview-audio path also swallows `error` events instead of letting them propagate as `ended`. Suppressed events log `[kiosk] ... skip cascade`
5. **Inter-song cleanup** — when `trackId` becomes null, `useMusicKit.releasePlayer()` calls `stop()` + `queue.removeAll()` so the prior song's buffers + nowPlayingItem can be GC'd before the next `setQueue()` allocates new ones
6. **Auto-play race lock** — `autoPlayLockRef` flips synchronously before the network call and releases 3s later, preventing three startup effects from each piling 8 songs into the queue
7. **React Query tuning** — global `gcTime: 60_000`. KioskPage: `qrcode` never refetches; `nowPlaying` and `queue` poll every 8s instead of 5s. `useMusicKit.isAuthorized` reconciliation slowed from 1s to 5s. Cuts ~80 wasted requests/min

## Pi Kiosk (legacy)

Raspberry Pi support remains in place but is no longer the recommended platform — ARM Chromium's per-tab memory ceiling makes "Aw Snap" crashes endemic on long-running kiosks. Use Mac for new installs.

- **Install kiosk + audio agent**: `curl -fsSL https://jukboks.com/scripts/install-audio-agent.sh | bash` (no sudo)
- **Audio agent**: `scripts/rpi-portal/audio-agent.sh` — `pactl list short sinks`, friendly-named, POSTs to `/audio-devices`, polls `/audio-sink`, applies via `pactl set-default-sink` + `pactl set-sink-volume`. Also reports health via `/health`
- **Optional nightly auto-restart**: `curl -fsSL https://jukboks.com/scripts/install-nightly-restart.sh | bash` adds a 04:00 cron `pkill -f chromium`
- **Autostart relaunch loop**: chromium command wrapped in `while true; do chromium-browser ...; sleep 2; done &` so any kill is followed by a fresh launch within 2s
- **Headless Pi pattern**: pair `?audioOnly=1` on the Pi with `?display=true` on a separate cheap display device (TV stick, tablet, old laptop) to dramatically cut renderer memory pressure and isolate blast radius

Both Pi audio endpoints are public — sink names are non-sensitive metadata, the venue code is the gate. Devices payload capped at 20 entries; names capped at 200 chars.

## External Dependencies
- **Apple Music API** — search, 30s previews (iTunes), full playback (MusicKit JS)
- **Sonos API** — planned OAuth 2.0 integration for Sonos speaker control
- **Replit Auth** — owner/staff authentication
- **PostgreSQL** — primary database
