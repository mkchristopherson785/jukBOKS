# Jukboks - Community Music Request Platform

## Overview
Jukboks is a standalone SaaS platform that enables businesses (bars, restaurants, gyms, HOAs, event venues) to create interactive music experiences where guests can request and vote on songs.

## Key Features
- **Apple Music Integration**: Full MusicKit JS integration for song search and playback
- **Sonos Integration**: Control Sonos speakers for venue playback via OAuth 2.0 (Coming Soon - requires SMAPI)
- **iOS App**: Native iOS app via Capacitor with dual-mode (Host/Guest) and bottom tab navigation
- **Unified Queue**: Mix of user requests and auto-play songs from backup playlists
- **QR Code Party Access**: Guests scan a QR code to join and request songs without accounts
- **Kiosk Display Mode**: TV/display-friendly "Now Playing" screen with scheduled playback, animated song transitions, album art glow, and live listener count
- **Listen Along**: Remote users with Apple Music can sync playback in real-time
- **Venue Branding**: Organization primary color applied to party page buttons and accents via CSS custom properties
- **Song Preview Playback**: Guests can tap album art in search results to hear a 30-second iTunes preview before requesting
- **Duplicate Request Prevention**: Search results show "In Queue" badge for songs already queued, preventing duplicate requests
- **Connection Status Indicator**: Offline/reconnecting banner on party pages when server connection drops
- **Mobile Host Quick Actions**: Skip song, clear queue (with confirmation), and live listener count on host dashboard
- **Per-Venue Settings**: Explicit content filtering, daily request limits (1-10 or unlimited), auto-approve
- **Upvote/Downvote System**: Guests can thumbs up or thumbs down songs in the queue
- **Smart Repetition Prevention**: Configurable song cooldown (30min-24hrs) and artist play limits per hour, persisted across server reboots
- **Backup Playlists**: Up to 10 playlists per venue for auto-play when queue is empty, with weighted selection (1-5) to control how often each playlist is used
- **Announcement Groups**: Multiple announcement groups per venue, each with independent timing rules (every X songs, every X minutes, or hourly) and play modes (sequential/random). Add announcements to the same group to share rules, or create new groups for different schedules.
- **Multi-Organization Support**: Each business manages their own venues
- **Team Management**: Invite team members by email to share admin access to venues
- **Integration API**: External apps can embed Jukboks functionality
- **Super Admin**: Platform-wide admin access for designated emails to view all organizations and venues

## Architecture

### Multi-Tenant Structure
```
Organizations (businesses)
  └── Users (staff/managers for that organization)
  └── Venues (each location/room with its own queue)
       └── Music Requests (song queue)
       └── Party Sessions (daily QR codes)
            └── Guests (anonymous party attendees)
```

### Tech Stack
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM
- **Music**: Apple Music API (MusicKit JS)
- **Auth**: Replit Auth (Google, Apple, email/password) for venue owners, tokens for guest/API access

## Directory Structure
```
jukboks/
├── server/           # Backend API
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API endpoints
│   ├── storage.ts    # Database operations
│   └── db.ts         # Database connection
├── client/           # Frontend React app
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   │   └── mobile/  # Mobile app pages (MobileApp, GuestParty, HostApp, etc.)
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities
│   └── index.html    # Entry HTML
├── ios/              # Capacitor iOS project
│   └── App/          # Xcode project
├── shared/           # Shared types and schemas
│   └── schema.ts     # Database schema + Zod validators
├── docs/             # Documentation
│   └── INTEGRATION_API.md  # API integration guide
└── package.json
```

## Database Schema
- **organizations**: Businesses using Jukboks (branding, API keys, subscription, ownerId)
- **organization_members**: Team members invited to manage an organization (email, authUserId, role)
- **users**: Organization staff/managers
- **venues**: Individual locations/rooms with their own queues and settings
- **requests**: Song queue items with status tracking and playedAt timestamp
- **votes**: Upvotes and downvotes on song requests (voteType: 'up' or 'down')
- **party_sessions**: Daily QR codes for guest access
- **guests**: Anonymous party attendees with request limits
- **backup_playlists**: Apple Music playlists for auto-play when queue is empty (max 10 per venue)
- **announcement_groups**: Groups of announcements with independent scheduling rules (frequencyType, frequency, playMode)
- **announcements**: Pre-recorded audio files linked to announcement groups (name, audioUrl, isActive, position, groupId)
- **auth_users**: Authentication users from Replit Auth (linked via ownerId)

## Announcement Groups
Each announcement group has its own independent scheduling:
- **frequencyType**: 'songs' (every X songs), 'minutes' (every X minutes), or 'hourly' (top of each hour)
- **frequency**: Number of songs or minutes between announcements (default: 5, not used for 'hourly')
- **playMode**: 'sequential' or 'random' for multiple announcements in the group
- **songsSincePlay**: Counter for song-based triggers
- **lastPlayedAt**: Timestamp for time-based triggers
- **lastPlayedIndex**: Index tracking for sequential play mode

Example use case: 2 announcements with hourly/sequential + 1 announcement every 10 minutes

## API Endpoints

### Public (No Auth Required)
- `GET /api/v1/venues/:code` - Get venue info
- `GET /api/v1/venues/:code/queue` - Get current queue
- `GET /api/v1/venues/:code/now-playing` - What's currently playing
- `GET /api/v1/venues/:code/qrcode` - Generate QR code for party

### Guest Access (Token Required)
- `GET /api/v1/party/:code` - Get party page data
- `POST /api/v1/party/:code/join` - Join as guest
- `POST /api/v1/venues/:code/request` - Submit a song request
- `POST /api/v1/venues/:code/vote` - Vote on a song

### Authenticated (API Key Required)
- `POST /api/v1/venues/:code/request` - Submit request via API
- `POST /api/v1/venues/:code/vote` - Vote via API

### Admin
- `POST /api/setup/demo` - Create demo organization and venue

### Super Admin
- `GET /api/super-admin/check` - Check if current user is a super admin
- `GET /api/super-admin/organizations` - Get all organizations (super admin only)
- `GET /api/super-admin/venues` - Get all venues (super admin only)

## Admin Interface Structure
The admin page (`/admin`) has four main tabs:
- **Venues**: Manage venues, view queue, recent plays, banned songs
- **Team**: Invite and manage team members
- **Branding**: Customize organization name, logo, and colors
- **Settings**: Configure backup playlists, Sonos integration, and announcements

Super admins can access the `/super-admin` page via a shield icon in the header.

## Integration API

External apps (like LivHOA) can integrate with Jukboks using:

### Authentication
- **API Key**: Generated per organization for server-to-server calls
- **Venue Code**: Public code for accessing a specific venue's party

### Embeddable Options
1. **Redirect**: Link users to `party.jukboks.app/{venue-code}`
2. **Iframe**: Embed the party page in your app
3. **API**: Build custom UI using the API endpoints

See `docs/INTEGRATION_API.md` for full API documentation.

## Pages
- `/` - Landing page with "Launch Demo Party" button
- `/party/:code` - Guest party interface for requesting songs
- `/kiosk/:code` - Full-screen display for venues
- `/admin` - Admin dashboard for venue management

## Mobile App (iOS via Capacitor)
The app includes a mobile-optimized experience with dual-mode navigation:

**Guest Mode:**
- Enter venue code to join a party
- Now Playing, Search, and Queue tabs
- Vote on songs, request songs, Listen Along
- Bottom tab navigation

**Host Mode:**
- Sign in to manage venues
- Dashboard, Queue, and Settings tabs
- Quick venue settings toggles
- Kiosk status monitoring

**Architecture:**
- `client/src/pages/mobile/MobileApp.tsx` - Main mobile router with role selection
- `client/src/pages/mobile/MobileWelcome.tsx` - Role selection screen
- `client/src/pages/mobile/GuestJoin.tsx` - Venue code entry
- `client/src/pages/mobile/GuestParty.tsx` - Full guest experience with tabs
- `client/src/pages/mobile/HostApp.tsx` - Full host experience with tabs
- `client/src/hooks/useCapacitor.ts` - Capacitor/mobile detection
- `client/src/hooks/useMobileRole.ts` - Role persistence
- `/mobile` route accessible on desktop for testing

**Capacitor Config:** `capacitor.config.ts`
- App ID: `com.jukboks.app`
- Web Dir: `dist/public`

## Raspberry Pi Kiosk
A Raspberry Pi can serve as a plug-and-play kiosk device. Setup script at `scripts/rpi-setup.sh`.

**Setup Options:**
```bash
# Option A: Hotspot mode (configure from phone)
sudo bash rpi-setup.sh --hotspot-only

# Option B: Direct setup (if you know the details)
sudo bash rpi-setup.sh --venue-code YOUR_CODE --url https://your-app.replit.app
```

**Hotspot Setup Flow:**
1. Run setup with `--hotspot-only` and reboot
2. Pi creates "Jukboks-Setup" WiFi network (password: jukboks123)
3. Connect from phone — setup page opens automatically
4. Enter WiFi network, venue code, and app URL
5. Pi connects to WiFi and starts the kiosk
6. If WiFi ever fails, the hotspot reactivates for reconfiguration

**URL Parameters (kiosk page):**
- `?autostart=true` - Skip "Start Kiosk" button, auto-begin playback
- `?layout=square` - Compact layout for small/square displays

**Architecture:**
- `scripts/rpi-setup.sh` - Main installer (packages, services, management commands)
- `scripts/rpi-portal/portal.py` - Captive portal web server with setup UI
- `scripts/rpi-portal/wifi-manager.sh` - WiFi connection manager with hotspot fallback
- `/etc/jukboks/config.json` - Persistent venue/WiFi config on the Pi
- `/opt/jukboks/` - Installed portal files on the Pi

**Management Commands:**
- `jukboks-status` - Check kiosk status, WiFi, hotspot
- `jukboks-restart` - Restart the browser
- `jukboks-update-venue X` - Change venue code
- `jukboks-reset` - Clear config and restart setup hotspot

## Kiosk Monitoring
- **Heartbeat**: Kiosk sends heartbeat every 30 seconds with device ID, name, and playback status
- **Lock System**: Only one device can control playback per venue (lock expires after 90 seconds)
- **Status Display**: Settings shows kiosk status (Playing/Paused/Ready/Offline) with device name
- **Per-Day Scheduling**: Different start/end times for each day of the week
- **Alert Email**: Notification field for offline kiosk detection during scheduled hours

**Database Fields (venues table):**
- `kioskScheduleEnabled`, `kioskScheduleDays`, `kioskStartTime`, `kioskEndTime` - Schedule config
- `kioskDaySchedules` - Per-day custom times (JSON object)
- `kioskLockId`, `kioskLockHeartbeat` - Device lock tracking
- `kioskPlaybackStatus`, `kioskDeviceName` - Current kiosk state
- `kioskAlertEmail`, `kioskLastAlertSentAt` - Alert notifications

## Running the App
```bash
npm install
npm run db:push    # Push database schema
npm run dev        # Start development server
```

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)
- `APPLE_TEAM_ID` - Apple Developer Team ID (10 characters)
- `APPLE_KEY_ID` - MusicKit Key ID (10 characters)
- `APPLE_MUSIC_PRIVATE_KEY` - Contents of .p8 private key file

## Apple Music Integration
The app uses MusicKit JS for full song playback with Apple Music subscriptions. The server generates JWT developer tokens (ES256 algorithm, 180-day expiry) using the Apple credentials. 

Key components:
- `/api/apple-music/token` - Server endpoint that generates and caches JWT tokens
- `useMusicKit` hook - Manages MusicKit configuration, authorization, and playback state
- `MusicKitPlayer` component - Unified player with Apple Music streaming and preview fallback

If a user doesn't have Apple Music, the player falls back to 30-second iTunes previews.

## Sonos Integration
Venues can connect Sonos speakers for playback instead of using the browser's audio. Uses OAuth 2.0 flow.

**Environment Variables:**
- `SONOS_CLIENT_ID` - Sonos Developer client ID
- `SONOS_CLIENT_SECRET` - Sonos Developer client secret

**Database Fields (venues table):**
- `sonosEnabled` - Whether Sonos playback is enabled for this venue
- `sonosAccessToken` / `sonosRefreshToken` - OAuth tokens
- `sonosTokenExpiresAt` - Token expiration timestamp
- `sonosHouseholdId` - Connected Sonos household
- `sonosGroupId` / `sonosGroupName` - Selected speaker group

**API Endpoints:**
- `GET /api/sonos/connect/:venueCode` - Start OAuth flow
- `GET /api/sonos/callback` - Handle OAuth callback
- `GET /api/venues/:code/sonos` - Get Sonos status and available groups
- `PATCH /api/venues/:code/sonos` - Update Sonos settings (groupId, enabled)
- `DELETE /api/venues/:code/sonos` - Disconnect Sonos
- `POST /api/venues/:code/sonos/play` - Play a track on Sonos
- `POST /api/venues/:code/sonos/control` - Control playback (play/pause/skip)
