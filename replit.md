# Jukboks - Community Music Request Platform

## Overview
Jukboks is a SaaS platform designed for businesses like bars, restaurants, and event venues to offer interactive music experiences. Guests can request and vote on songs, creating a dynamic and engaging atmosphere. The platform aims to enhance customer experience, drive engagement, and provide venues with a unique selling proposition through customizable music interactions.

## User Preferences
I prefer detailed explanations of complex technical decisions. When implementing new features, propose the high-level approach and key components before diving into coding. For critical architectural changes, ask for approval first. Ensure all code is well-documented and follows modern TypeScript/React best practices.

## System Architecture

### Multi-Tenant Structure
The system is built with a multi-tenant architecture:
- **Organizations**: Represent businesses, each with their own branding and settings.
- **Users**: Staff and managers within an organization.
- **Venues**: Individual locations or rooms, each hosting its own music queue and guest interactions.
- **Party Sessions**: Daily instances of guest interaction tied to a QR code.
- **Guests**: Anonymous users requesting and voting on songs.

### Tech Stack
-   **Backend**: Node.js, Express, TypeScript
-   **Frontend**: React, Vite, TailwindCSS, shadcn/ui
-   **Database**: PostgreSQL with Drizzle ORM
-   **Music Integration**: Apple Music API (MusicKit JS)
-   **Authentication**: Replit Auth (Google, Apple, email/password) for venue owners, token-based for guests and API.

### UI/UX Decisions
-   **Mobile App**: Native iOS app via Capacitor with dual Host/Guest modes and bottom tab navigation.
-   **Kiosk Display Mode**: TV-friendly "Now Playing" screen with scheduled playback, animated transitions, and live listener count.
-   **Venue Branding**: Custom CSS properties allow organizations to apply their primary color to party page elements.

### Listen Along — Time Sync
Guests on the party page can tap "Listen Along" to stream the venue's current song through their own Apple Music subscription. Playback now starts at the **venue's current playback position**, not from the start of the song. Implementation:
- Server `/api/v1/party/:partyCode` returns `nowPlaying.startedAt` (ISO), `nowPlaying.duration` (ms), and a top-level `serverNow` (ISO) so the client can cancel out clock skew.
- The party query stamps `__receivedAtMs` on each fetch.
- `getVenuePositionMs()` = `(serverNow - startedAt) + (Date.now() - __receivedAtMs)`, clamped to song length.
- `useMusicKit.playSong(trackId, { startPositionMs })` calls `seekToTime(startPositionMs / 1000)` after `play()` (only if > 1.5s).
- A 15-second drift check compares `getCurrentPlaybackTimeMs()` against `getVenuePositionMs()` and re-seeks when drift > 2s.

### Core Features
-   **Unified Queue**: Blends user requests with auto-play songs from backup playlists.
-   **QR Code Access**: Guests join parties and request songs without account creation.
-   **Smart Repetition Prevention**: Configurable cooldowns for songs and artists.
-   **Upvote/Downvote System**: Guests influence queue order.
-   **Announcement Groups**: Scheduled audio announcements with flexible timing and play modes.
-   **Admin Queue Management**: Approve/reject requests, remove songs.
-   **Mobile Host Quick Actions**: Skip song, clear queue, view live listener count.
-   **Venue Analytics**: Tracks key metrics like total songs played, unique guests, and peak hours.
-   **Kiosk Monitoring**: Heartbeat system, device locking, scheduled playback, and offline alerts for Raspberry Pi kiosks. When another device holds the lock, the "Playback Locked" screen shows a "Play here instead" button that calls `POST /api/v1/venues/:code/kiosk-release` to clear the lock and lets the new device claim it via the next heartbeat.
-   **Integration API**: API key management UI in Settings, with authenticated endpoints for external platforms (LivHOA). Endpoints: search songs, list venues, play history, request songs, vote, trigger urgent announcements (TTS or audio URL). Keys are masked after generation (shown once, then hidden). Documented at `docs/INTEGRATION_API.md`.
-   **Urgent Announcements**: External systems can trigger immediate announcements via `POST /api/v1/venues/:code/announce`. Supports text-to-speech (browser SpeechSynthesis API on kiosk) or pre-recorded audio URLs. Urgent announcements interrupt the current song immediately and play twice. Auto-clear after playback.
-   **TV Display Mode**: A display-only version of the kiosk screen at `/kiosk/:code?display=true`. Shows now playing, queue, QR code, and album art without any audio playback. No device locking or heartbeats — multiple TVs can run simultaneously. Supports `layout=square` and other kiosk URL params.
-   **Guest Favorites**: Cloud-synced per-venue favorites stored in the database, keyed by guest name + venue. Favorites persist across devices — guests see the same favorites on any phone/browser as long as they join with the same name. API: `GET/POST /api/v1/venues/:code/favorites`, `DELETE /api/v1/venues/:code/favorites/:trackId`. Includes one-time localStorage migration for legacy favorites.
-   **Song Details ("View More")**: Each song row in the queue, in search results, and in play history has an Info button that opens a `SongDetailsDialog` modal. The modal shows large album art, title, artist, album, length, release date, genre, track number, an Apple Music link, a 30-second preview play button, and a "You might also like" section with similar songs. Clicking a similar song drills into its details (with a Back button to navigate the breadcrumb). Each similar song also has a "+" button to add it directly to the queue when the dialog is opened from a request-capable surface (party page queue, search). The button shows a check mark when the track is already queued or just requested. Backed by `GET /api/v1/tracks/:trackId` (rich metadata) and `GET /api/v1/tracks/:trackId/similar?limit=N` (artist-based suggestions, deduped by title to avoid album-edition duplicates). Both endpoints proxy Apple's iTunes Lookup API, are cached server-side for 24 hours with a bounded LRU, have a 5s upstream timeout, and are exposed in the Integration API for external systems. The dialog accepts an optional `onRequest(track)` callback + `queuedTrackIds` set to enable the inline add-to-queue flow.
-   **Kiosk Admin Controls (VenuesPage)**: Each venue card has a "Display Layout" dropdown (Landscape 16:9 / Square 1:1) writing `venues.kioskLayout`, and an "Audio Output" dropdown listing sinks reported by the Pi (writes `venues.kioskAudioSink`). KioskPage uses `serverLayout ?? urlLayout ?? "default"` with 30s refetch. Apple Music connect/disconnect is also on each card; `/api/me/venues` strips the raw `appleMusicUserToken` and returns an `appleMusicConnected` boolean instead.
-   **Pi Audio Output Picker**: The Raspberry Pi runs a `jukboks-audio-agent` systemd-user service (installed via `curl -fsSL https://jukboks.com/scripts/install-audio-agent.sh | bash`, no sudo). Every 60s it `pactl list short sinks`, POSTs friendly-named devices to `POST /api/v1/venues/:code/audio-devices`, polls `GET /api/v1/venues/:code/audio-sink`, and applies the selection via `pactl set-default-sink`. Both Pi endpoints are public — sink names are non-sensitive metadata and the venue code is the gate (same trust model as the party page). The audio agent runs as a separate process from the kiosk Chromium so its deviceId can't match the kiosk lock holder, which is why we don't enforce the lock here. Devices payload is capped at 20 entries; each name/description capped at 200 chars. Stable per-Pi deviceId stored in `~/.config/jukboks/device-id`. Bash agent at `scripts/rpi-portal/audio-agent.sh`, served by Express at `/scripts/audio-agent.sh`.
-   **Headless Kiosk Apple Music Pairing**: Raspberry Pi kiosks (no monitor/keyboard) can stream full Apple Music songs by pairing once from the venue owner's phone. Kiosk requests a 6-digit code from `POST /api/v1/venues/:code/pairing-code` (10-min TTL, in-memory store in `server/pairing-codes.ts`) and shows it as a banner overlay. Owner visits `/pair` on phone, enters code, and after `useMusicKit.authorize()` completes the resulting `musicUserToken` is POSTed to `/api/me/pair` (auth'd, verifies user owns the venue). Token saved to `venues.appleMusicUserToken`. Kiosk polls `GET /api/v1/venues/:code/apple-music-token` every 30s and applies it via `useMusicKit.applyMusicUserToken(token)` which sets `musicKit.musicUserToken` directly — no popup, no user gesture needed. Owner can disconnect via `DELETE /api/me/venues/:venueId/apple-music-token`.
-   **Guest Ranking / Gamification**: Guests earn ranks based on total upvotes received on their song requests. Ranks: Wallflower (0-9, no hat), Crowd Pleaser (10-29, party hat), Vibe Curator (30-74, beret), Beat Dropper (75-149, backwards cap), Hitmaker (150-299, top hat), Jukebox Hero (300+, crown). Rank logic lives in `shared/ranks.ts` so both client and server use the same thresholds. Components: `GuestRankBadge` (inline hat icon next to requester names in queue), `GuestRankCard` (full card with progress bar shown on party/search pages). Rankings aggregated server-side via `getGuestRankings()` in storage, returned in party API response. Case-insensitive name matching for display. Integration API endpoints `/api/v1/venues/:code/queue` and `/api/v1/venues/:code/history` include `requesterRank: { level, name, totalUpvotes }` for each guest-requested song.

## External Dependencies
-   **Apple Music API**: Utilized for song search, 30-second previews (iTunes API), and full playback via MusicKit JS.
-   **Sonos API**: (Planned integration) For controlling Sonos speakers in venues via OAuth 2.0.
-   **Replit Auth**: Provides user authentication for venue owners and staff.
-   **PostgreSQL**: Primary database for all application data.