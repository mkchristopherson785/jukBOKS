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

### Core Features
-   **Unified Queue**: Blends user requests with auto-play songs from backup playlists.
-   **QR Code Access**: Guests join parties and request songs without account creation.
-   **Smart Repetition Prevention**: Configurable cooldowns for songs and artists.
-   **Upvote/Downvote System**: Guests influence queue order.
-   **Announcement Groups**: Scheduled audio announcements with flexible timing and play modes.
-   **Admin Queue Management**: Approve/reject requests, remove songs.
-   **Mobile Host Quick Actions**: Skip song, clear queue, view live listener count.
-   **Venue Analytics**: Tracks key metrics like total songs played, unique guests, and peak hours.
-   **Kiosk Monitoring**: Heartbeat system, device locking, scheduled playback, and offline alerts for Raspberry Pi kiosks.
-   **Integration API**: API key management UI in Settings, with authenticated endpoints for external platforms (LivHOA). Endpoints: search songs, list venues, play history, request songs, vote, trigger urgent announcements (TTS or audio URL). Keys are masked after generation (shown once, then hidden). Documented at `docs/INTEGRATION_API.md`.
-   **Urgent Announcements**: External systems can trigger immediate announcements via `POST /api/v1/venues/:code/announce`. Supports text-to-speech (browser SpeechSynthesis API on kiosk) or pre-recorded audio URLs. Urgent announcements interrupt the current song immediately and play twice. Auto-clear after playback.
-   **TV Display Mode**: A display-only version of the kiosk screen at `/kiosk/:code?display=true`. Shows now playing, queue, QR code, and album art without any audio playback. No device locking or heartbeats — multiple TVs can run simultaneously. Supports `layout=square` and other kiosk URL params.
-   **Guest Favorites**: Cloud-synced per-venue favorites stored in the database, keyed by guest name + venue. Favorites persist across devices — guests see the same favorites on any phone/browser as long as they join with the same name. API: `GET/POST /api/v1/venues/:code/favorites`, `DELETE /api/v1/venues/:code/favorites/:trackId`. Includes one-time localStorage migration for legacy favorites.
-   **Song Details ("View More")**: Each song row in the queue, in search results, and in play history has an Info button that opens a `SongDetailsDialog` modal. The modal shows large album art, title, artist, album, length, release date, genre, track number, an Apple Music link, and a 30-second preview play button. Backed by `GET /api/v1/tracks/:trackId` which proxies Apple's iTunes Lookup API and caches results for 24 hours both server-side and per-session client-side. The same endpoint is exposed in the Integration API for external systems.
-   **Guest Ranking / Gamification**: Guests earn ranks based on total upvotes received on their song requests. Ranks: Wallflower (0-9, no hat), Crowd Pleaser (10-29, party hat), Vibe Curator (30-74, beret), Beat Dropper (75-149, backwards cap), Hitmaker (150-299, top hat), Jukebox Hero (300+, crown). Rank logic lives in `shared/ranks.ts` so both client and server use the same thresholds. Components: `GuestRankBadge` (inline hat icon next to requester names in queue), `GuestRankCard` (full card with progress bar shown on party/search pages). Rankings aggregated server-side via `getGuestRankings()` in storage, returned in party API response. Case-insensitive name matching for display. Integration API endpoints `/api/v1/venues/:code/queue` and `/api/v1/venues/:code/history` include `requesterRank: { level, name, totalUpvotes }` for each guest-requested song.

## External Dependencies
-   **Apple Music API**: Utilized for song search, 30-second previews (iTunes API), and full playback via MusicKit JS.
-   **Sonos API**: (Planned integration) For controlling Sonos speakers in venues via OAuth 2.0.
-   **Replit Auth**: Provides user authentication for venue owners and staff.
-   **PostgreSQL**: Primary database for all application data.