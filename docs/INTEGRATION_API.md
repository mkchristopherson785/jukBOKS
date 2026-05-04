# Jukboks Integration API

This document describes how external applications (like LivHOA) can integrate with Jukboks to provide music request functionality to their users.

## Overview

There are three ways to integrate with Jukboks:

1. **Redirect** - Link users to the Jukboks party page
2. **Embed** - Use an iframe to embed the party experience
3. **API** - Build a custom UI using the Jukboks API

## Authentication

### API Key (Server-to-Server)
For server-side integrations, use an API key in the request header:
```
X-Jukboks-API-Key: your-api-key-here
```

API keys are generated per organization in the Jukboks dashboard.

### Venue Code (Public Access)
For client-side access, use the public venue code in the URL path. No authentication required for read-only operations.

### Guest Token (Anonymous Users)
For guest access (via QR code party), use the session token:
```
X-Guest-Token: guest-session-token
```

## Base URL
```
Production: https://jukboks.replit.app
```

---

## Public Endpoints (No Auth Required)

### Get Venue Info
```
GET /api/v1/venues/:code
```

**Response:**
```json
{
  "code": "pool-deck",
  "name": "Pool Deck",
  "organizationName": "Village Oaks HOA",
  "logoUrl": "https://...",
  "logoDarkUrl": "https://...",
  "primaryColor": "#2563eb",
  "allowExplicit": false,
  "dailyRequestLimit": 5
}
```

### Get Queue
```
GET /api/v1/venues/:code/queue
```

**Response:**
```json
{
  "items": [
    {
      "id": 123,
      "trackId": "1234567890",
      "title": "Shape of You",
      "artist": "Ed Sheeran",
      "albumCover": "https://...",
      "requesterName": "John D.",
      "isAutoPlay": false,
      "voteCount": 5,
      "status": "approved"
    }
  ]
}
```

### Get Now Playing
```
GET /api/v1/venues/:code/now-playing
```

**Response:**
```json
{
  "trackId": "1234567890",
  "title": "Shape of You",
  "artist": "Ed Sheeran",
  "albumCover": "https://...",
  "startedAt": "2025-01-27T10:30:00Z",
  "duration": 234000
}
```

---

## Authenticated Endpoints (API Key Required)

### List Venues
```
GET /api/v1/venues
Headers:
  X-Jukboks-API-Key: your-api-key
```

**Response:**
```json
{
  "venues": [
    {
      "id": 1,
      "code": "pool-deck",
      "name": "Pool Deck",
      "isActive": true,
      "allowExplicit": false,
      "autoApprove": true,
      "dailyRequestLimit": 5
    }
  ]
}
```

### Search Songs
```
GET /api/v1/search?term=shape+of+you&limit=20&offset=0
Headers:
  X-Jukboks-API-Key: your-api-key
```

**Response:**
```json
{
  "results": [
    {
      "trackId": "1234567890",
      "title": "Shape of You",
      "artist": "Ed Sheeran",
      "album": "÷ (Divide)",
      "albumCover": "https://...",
      "duration": 234000,
      "isExplicit": false,
      "previewUrl": "https://..."
    }
  ],
  "total": 20
}
```

### Get Play History
```
GET /api/v1/venues/:code/history?limit=50
Headers:
  X-Jukboks-API-Key: your-api-key
```

**Response:**
```json
{
  "history": [
    {
      "id": 123,
      "trackId": "1234567890",
      "title": "Shape of You",
      "artist": "Ed Sheeran",
      "album": "÷ (Divide)",
      "albumCover": "https://...",
      "requesterName": "John D.",
      "isAutoPlay": false,
      "playedAt": "2025-01-27T10:30:00Z"
    }
  ]
}
```

### Trigger Urgent Announcement
```
POST /api/v1/venues/:code/announce
Headers:
  X-Jukboks-API-Key: your-api-key
  Content-Type: application/json
```

Triggers an immediate announcement on the kiosk. The announcement plays after the current song ends. Provide either `message` (text-to-speech) or `audioUrl` (pre-recorded audio), or both.

**Request Body:**
```json
{
  "message": "Lightning has been detected in the area. Please vacate the pool area until further notice.",
  "audioUrl": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Urgent announcement queued. It will play on the kiosk after the current song ends."
}
```

### Cancel Pending Announcement
```
DELETE /api/v1/venues/:code/announce
Headers:
  X-Jukboks-API-Key: your-api-key
```

Cancels a pending urgent announcement before it plays.

**Response:**
```json
{
  "success": true,
  "message": "Pending urgent announcement cancelled"
}
```

### Submit Song Request
```
POST /api/v1/venues/:code/request
Headers:
  X-Jukboks-API-Key: your-api-key
```

**Request Body:**
```json
{
  "trackId": "1234567890",
  "title": "Shape of You",
  "artist": "Ed Sheeran",
  "album": "÷ (Divide)",
  "albumCover": "https://...",
  "duration": 234000,
  "isExplicit": false,
  "requesterName": "John Doe",
  "externalUserId": "user-123"
}
```

**Response:**
```json
{
  "success": true,
  "requestId": 456,
  "message": "Song added to queue"
}
```

**Error Responses:**
```json
{
  "success": false,
  "error": "EXPLICIT_NOT_ALLOWED",
  "message": "This venue does not allow explicit content"
}
```

```json
{
  "success": false,
  "error": "DAILY_LIMIT_REACHED",
  "message": "You have reached your daily request limit of 5 songs"
}
```

### Vote on Request
```
POST /api/v1/venues/:code/vote
Headers:
  X-Jukboks-API-Key: your-api-key
```

**Request Body:**
```json
{
  "requestId": 456,
  "externalUserId": "user-123"
}
```

**Response:**
```json
{
  "success": true,
  "voteCount": 6
}
```

### Remove Vote
```
DELETE /api/v1/venues/:code/vote/:requestId
Headers:
  X-Jukboks-API-Key: your-api-key
Query:
  externalUserId=user-123
```

---

## Party/Guest Endpoints

### Get Party Page Data
```
GET /api/v1/party/:partyCode
```

**Response:**
```json
{
  "venue": {
    "code": "pool-deck",
    "name": "Pool Deck",
    "allowExplicit": false,
    "dailyRequestLimit": 5
  },
  "branding": {
    "organizationName": "Village Oaks HOA",
    "logoUrl": "https://...",
    "primaryColor": "#2563eb"
  },
  "nowPlaying": {
    "title": "Shape of You",
    "artist": "Ed Sheeran",
    "albumCover": "https://..."
  },
  "queue": [
    {
      "id": 123,
      "title": "Blinding Lights",
      "artist": "The Weeknd",
      "voteCount": 3
    }
  ]
}
```

### Join Party as Guest
```
POST /api/v1/party/:partyCode/join
```

**Request Body:**
```json
{
  "name": "John"
}
```

**Response:**
```json
{
  "success": true,
  "sessionToken": "guest-abc123...",
  "guestId": 789,
  "requestsRemaining": 5
}
```

### Submit Request as Guest
```
POST /api/v1/party/:partyCode/request
Headers:
  X-Guest-Token: guest-abc123...
```

**Request Body:**
```json
{
  "trackId": "1234567890",
  "title": "Blinding Lights",
  "artist": "The Weeknd",
  "albumCover": "https://...",
  "duration": 200000,
  "isExplicit": false
}
```

---

## Webhook Events (Coming Soon)

Jukboks can send webhooks to your application for real-time updates:

```json
{
  "event": "song.now_playing",
  "venue": "pool-deck",
  "data": {
    "title": "Shape of You",
    "artist": "Ed Sheeran"
  },
  "timestamp": "2025-01-27T10:30:00Z"
}
```

**Events:**
- `song.now_playing` - New song started playing
- `song.requested` - New song added to queue
- `song.voted` - Vote added/removed
- `queue.empty` - Queue is empty (auto-fill may be triggered)

---

## Embedding Options

### Option 1: Redirect to Party Page
Simply link users to the Jukboks party page:
```
https://jukboks.replit.app/party/{venue-code}
```

### Option 2: Iframe Embed
Embed the party experience in your app:
```html
<iframe 
  src="https://jukboks.replit.app/party/{venue-code}?embed=true"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

### Option 3: Widget Script (Coming Soon)
```html
<div id="jukboks-widget" data-venue="pool-deck"></div>
<script src="https://jukboks.replit.app/widget.js"></script>
```

---

## LivHOA Integration Example

### Step 1: Store Jukboks Credentials
In LivHOA tenant settings, store:
- `jukboksVenueCode`: The venue code from Jukboks
- `jukboksApiKey`: The organization API key (optional, for server-side requests)

### Step 2: Link to Party Page
From the LivHOA dashboard, link to the Jukboks party:
```jsx
<a href={`https://jukboks.replit.app/party/${tenant.jukboksVenueCode}`}>
  Open Music Jukebox
</a>
```

### Step 3: Display Now Playing (Optional)
Fetch and display the current song in LivHOA:
```javascript
const response = await fetch(`https://jukboks.replit.app/api/v1/venues/${venueCode}/now-playing`);
const nowPlaying = await response.json();
// Display in LivHOA UI
```

### Step 4: Server-Side Requests (Optional)
If you want LivHOA users to request songs through LivHOA's UI:
```javascript
// Server-side (to protect API key)
const response = await fetch(`https://jukboks.replit.app/api/v1/venues/${venueCode}/request`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Jukboks-API-Key': process.env.JUKBOKS_API_KEY
  },
  body: JSON.stringify({
    trackId: '123',
    title: 'Song Name',
    artist: 'Artist',
    requesterName: user.fullName,
    externalUserId: `livhoa-${user.id}`
  })
});
```

---

## Rate Limits

| Endpoint Type | Rate Limit |
|--------------|------------|
| Public (GET) | 100 requests/minute |
| Authenticated (POST) | 30 requests/minute |
| Guest | 10 requests/minute |

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_API_KEY` | API key is missing or invalid |
| `VENUE_NOT_FOUND` | Venue code doesn't exist |
| `EXPLICIT_NOT_ALLOWED` | Venue doesn't allow explicit content |
| `DAILY_LIMIT_REACHED` | User reached daily request limit |
| `DUPLICATE_REQUEST` | Song already in queue |
| `ALREADY_VOTED` | User already voted for this song |
| `PARTY_NOT_ACTIVE` | Party session not active today |
| `GUEST_TOKEN_INVALID` | Guest session expired or invalid |
