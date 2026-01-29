# Jukboks - Community Music Request Platform

## Overview
Jukboks is a standalone SaaS platform that enables businesses (bars, restaurants, gyms, HOAs, event venues) to create interactive music experiences where guests can request and vote on songs.

## Key Features
- **Apple Music Integration**: Full MusicKit JS integration for song search and playback
- **Sonos Integration**: Control Sonos speakers for venue playback via OAuth 2.0 (Coming Soon - requires SMAPI)
- **iOS App**: Native iOS app via Capacitor for App Store distribution
- **Unified Queue**: Mix of user requests and auto-play songs from backup playlists
- **QR Code Party Access**: Guests scan a QR code to join and request songs without accounts
- **Kiosk Display Mode**: TV/display-friendly "Now Playing" screen
- **Listen Along**: Remote users with Apple Music can sync playback in real-time
- **Per-Venue Settings**: Explicit content filtering, daily request limits (1-10 or unlimited), auto-approve
- **Upvote/Downvote System**: Guests can thumbs up or thumbs down songs in the queue
- **Duplicate Song Prevention**: Songs can't be requested again within 2 hours of playing
- **Backup Playlists**: Up to 10 playlists per venue for auto-play when queue is empty, with weighted selection (1-5) to control how often each playlist is used
- **Announcements**: Pre-recorded audio announcements that play between songs (configurable by song count or time interval, with sequential or random play modes)
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
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities
│   └── index.html    # Entry HTML
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
- **announcements**: Pre-recorded audio files that play between songs (name, audioUrl, isActive, position)
- **auth_users**: Authentication users from Replit Auth (linked via ownerId)

## Venue Settings
- **announcementFrequencyType**: null (disabled), 'songs' (every X songs), 'minutes' (every X minutes), or 'hourly' (top of each hour)
- **announcementFrequency**: Number of songs or minutes between announcements (default: 5, not used for 'hourly')
- **announcementPlayMode**: 'sequential' or 'random' for multiple announcements

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
