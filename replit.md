# Jukboks - Community Music Request Platform

## Overview
Jukboks is a standalone SaaS platform that enables businesses (bars, restaurants, gyms, HOAs, event venues) to create interactive music experiences where guests can request and vote on songs.

## Tech Stack
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TailwindCSS
- **Database**: PostgreSQL with Drizzle ORM
- **Music Search**: iTunes API (Apple Music metadata)

## Project Structure
```
jukboks/
├── server/               # Backend API
│   ├── index.ts         # Server entry point
│   ├── routes.ts        # API endpoints
│   ├── storage.ts       # Database operations
│   └── db.ts            # Database connection
├── client/              # Frontend React app
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities
│   └── index.html       # Entry HTML
├── shared/              # Shared types and schemas
│   └── schema.ts        # Database schema + Zod validators
└── package.json
```

## Key Features
- **Apple Music Integration**: Song search using iTunes API
- **Unified Queue**: Mix of user requests with voting
- **QR Code Party Access**: Guests scan a QR code to join and request songs
- **Kiosk Display Mode**: TV/display-friendly "Now Playing" screen
- **Per-Venue Settings**: Explicit content filtering, daily request limits
- **Multi-Organization Support**: Each business manages their own venues
- **Integration API**: External apps can embed Jukboks functionality

## Database Schema
- **organizations**: Businesses using Jukboks
- **users**: Organization staff/managers
- **venues**: Individual locations/rooms with their own queues
- **requests**: Song queue items
- **votes**: Upvotes on song requests
- **party_sessions**: Daily QR codes for guest access
- **guests**: Anonymous party attendees

## API Endpoints

### Public
- `GET /api/v1/venues/:code` - Get venue info
- `GET /api/v1/venues/:code/queue` - Get current queue
- `GET /api/v1/venues/:code/now-playing` - What's currently playing
- `GET /api/v1/venues/:code/qrcode` - Generate QR code for party

### Guest Access
- `GET /api/v1/party/:code` - Get party page data
- `POST /api/v1/party/:code/join` - Join as guest
- `POST /api/v1/venues/:code/request` - Submit a song request
- `POST /api/v1/venues/:code/vote` - Vote on a song

### Admin
- `POST /api/setup/demo` - Create demo organization and venue

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
