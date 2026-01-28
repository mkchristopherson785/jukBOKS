# Jukboks - Community Music Request Platform

## Overview
Jukboks is a standalone SaaS platform that enables businesses (bars, restaurants, gyms, HOAs, event venues) to create interactive music experiences where guests can request and vote on songs.

## Key Features
- **Apple Music Integration**: Full MusicKit JS integration for song search and playback
- **Unified Queue**: Mix of user requests and auto-play songs from backup playlists
- **QR Code Party Access**: Guests scan a QR code to join and request songs without accounts
- **Kiosk Display Mode**: TV/display-friendly "Now Playing" screen
- **Listen Along**: Remote users with Apple Music can sync playback in real-time
- **Per-Venue Settings**: Explicit content filtering, daily request limits (1-10 or unlimited), auto-approve
- **Upvote/Downvote System**: Guests can thumbs up or thumbs down songs in the queue
- **Duplicate Song Prevention**: Songs can't be requested again within 2 hours of playing
- **Backup Playlists**: Up to 10 playlists per venue for auto-play when queue is empty
- **Announcements**: Pre-recorded audio announcements that play between songs (configurable by song count or time interval, with sequential or random play modes)
- **Multi-Organization Support**: Each business manages their own venues
- **Team Management**: Invite team members by email to share admin access to venues
- **Integration API**: External apps can embed Jukboks functionality

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
