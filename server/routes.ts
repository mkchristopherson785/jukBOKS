import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { SignJWT, importPKCS8 } from "jose";
import { storage } from "./storage";
import type { InsertRequest, InsertVote } from "../shared/schema";
import { isVenueWithinSchedule } from "./schedule-utils";
import { isAuthenticated } from "./replit_integrations/auth";

const router = Router();

// Cache the token to avoid regenerating on every request
let cachedToken: { token: string; expiresAt: number } | null = null;

// In-memory store for tracking live listeners per venue
// Key: venueCode, Value: Map of listenerId -> { name, lastHeartbeat }
const liveListeners: Map<string, Map<string, { name: string; lastHeartbeat: number }>> = new Map();

// Clean up stale listeners every 30 seconds (listeners who haven't sent heartbeat in 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [venueCode, listeners] of liveListeners.entries()) {
    for (const [listenerId, data] of listeners.entries()) {
      if (now - data.lastHeartbeat > 60000) {
        listeners.delete(listenerId);
      }
    }
    if (listeners.size === 0) {
      liveListeners.delete(venueCode);
    }
  }
}, 30000);

// Apple Music developer token generation using jose library
async function generateAppleMusicToken(): Promise<string | null> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!teamId || !keyId || !privateKey) {
    console.error("Missing Apple Music credentials");
    return null;
  }

  try {
    // Handle different formats of private key
    let formattedKey = privateKey.trim();
    
    // Replace literal \n with actual newlines
    if (formattedKey.includes('\\n')) {
      formattedKey = formattedKey.replace(/\\n/g, '\n');
    }
    
    // If the key doesn't have proper PEM headers, add them
    if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
      // Remove any existing partial headers or whitespace
      formattedKey = formattedKey.replace(/-----.*-----/g, '').trim();
      // Wrap with proper headers
      formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
    }
    
    
    // Import the PKCS8 private key
    const key = await importPKCS8(formattedKey, 'ES256');
    
    // Create the JWT
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .setExpirationTime('180d')
      .sign(key);
    
    return token;
  } catch (error) {
    console.error("Failed to generate Apple Music token:", error);
    return null;
  }
}

async function getAppleMusicToken(): Promise<string | null> {
  const now = Date.now();
  // Regenerate if no cache or expires in less than 7 days
  if (!cachedToken || cachedToken.expiresAt < now + 7 * 24 * 60 * 60 * 1000) {
    const token = await generateAppleMusicToken();
    if (token) {
      // Token valid for 180 days
      cachedToken = {
        token,
        expiresAt: now + 180 * 24 * 60 * 60 * 1000,
      };
    }
  }
  return cachedToken?.token || null;
}

// Endpoint to get Apple Music developer token
router.get("/api/apple-music/token", async (_req: Request, res: Response) => {
  const token = await getAppleMusicToken();
  if (!token) {
    return res.status(500).json({ 
      error: "APPLE_MUSIC_ERROR", 
      message: "Apple Music credentials not configured" 
    });
  }
  res.json({ token });
});

// Proxy endpoint for iTunes search (avoids CORS issues on mobile)
router.get("/api/apple-music/search", async (req: Request, res: Response) => {
  const { term, limit = "20", offset = "0" } = req.query;
  
  if (!term || typeof term !== "string") {
    return res.status(400).json({ error: "Search term required" });
  }
  
  try {
    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=${limit}&offset=${offset}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("iTunes search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/api/apple-music/search-playlists", async (req: Request, res: Response) => {
  const { term, limit = "25" } = req.query;
  
  if (!term || typeof term !== "string") {
    return res.status(400).json({ error: "Search term required" });
  }
  
  const token = await getAppleMusicToken();
  if (!token) {
    return res.status(500).json({ error: "Could not get Apple Music token" });
  }
  
  try {
    const response = await fetch(
      `https://api.music.apple.com/v1/catalog/us/search?term=${encodeURIComponent(term)}&types=playlists&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      console.error("Apple playlist search failed:", response.status);
      return res.status(500).json({ error: "Search failed" });
    }
    
    const data = await response.json();
    const playlists = data.results?.playlists?.data || [];
    
    // Fetch accurate track counts for all playlists from tracks endpoint meta.total
    const results = await Promise.all(playlists.map(async (playlist: any) => {
      const attrTrackCount = playlist.attributes?.trackCount || 0;
      let trackCount = attrTrackCount;
      
      // Always try to get accurate count from tracks endpoint meta.total
      try {
        // Use limit=100 to get proper pagination metadata
        const tracksResponse = await fetch(
          `https://api.music.apple.com/v1/catalog/us/playlists/${playlist.id}/tracks?limit=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (tracksResponse.ok) {
          const tracksData = await tracksResponse.json();
          const metaTotal = tracksData.meta?.total;
          const hasNext = !!tracksData.next;
          const dataLength = tracksData.data?.length || 0;
          
          // Use meta.total if available, otherwise count based on pagination
          if (metaTotal && metaTotal > 0) {
            trackCount = metaTotal;
          } else if (hasNext && dataLength === 100) {
            // If there's a next page and we got 100 tracks, there are more than 100
            // Estimate at least 101 to indicate "100+"
            trackCount = dataLength + 100; // Conservative estimate
          } else if (dataLength > 0) {
            trackCount = dataLength;
          }
        } else {
          const errorText = await tracksResponse.text();
          console.error(`Failed to fetch tracks for ${playlist.id}: ${tracksResponse.status}`);
        }
      } catch (e) {
        console.error(`Error fetching tracks for ${playlist.id}:`, e);
      }
      
      return {
        id: playlist.id,
        name: playlist.attributes?.name || "Unknown Playlist",
        curatorName: playlist.attributes?.curatorName || "Apple Music",
        trackCount,
        artworkUrl: playlist.attributes?.artwork?.url?.replace("{w}x{h}", "100x100") || null,
      };
    }));
    
    res.json({ results });
  } catch (error) {
    console.error("Apple playlist search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

async function validateGuestToken(guestToken: string | undefined, venueId: number) {
  if (!guestToken) return null;
  
  const guest = await storage.getGuestByToken(guestToken);
  if (!guest) return null;
  
  const session = await storage.getPartySessionById(guest.partySessionId);
  if (!session || session.venueId !== venueId || !session.isActive) {
    return null;
  }
  
  return guest;
}

async function validateApiKey(apiKey: string | undefined) {
  if (!apiKey) return null;
  return await storage.getOrganizationByApiKey(apiKey);
}

async function fetchApplePlaylistDetails(playlistId: string) {
  const token = await getAppleMusicToken();
  if (!token) {
    return null;
  }

  try {
    // First, get basic playlist info with tracks relationship for accurate count
    const response = await fetch(
      `https://api.music.apple.com/v1/catalog/us/playlists/${playlistId}?include=tracks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Apple playlist fetch failed:", response.status);
      return null;
    }

    const data = await response.json();
    const playlist = data.data?.[0];
    if (!playlist) {
      return null;
    }

    // Get trackCount from attributes first
    let trackCount = playlist.attributes?.trackCount || 0;
    const attrCount = trackCount;
    
    // Always try to get accurate count from tracks endpoint meta.total
    try {
      // Use limit=100 to get proper pagination metadata
      const tracksResponse = await fetch(
        `https://api.music.apple.com/v1/catalog/us/playlists/${playlistId}/tracks?limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (tracksResponse.ok) {
        const tracksData = await tracksResponse.json();
        const metaTotal = tracksData.meta?.total;
        const hasNext = !!tracksData.next;
        const dataLength = tracksData.data?.length || 0;
        
        // Use meta.total if available, otherwise count based on pagination
        if (metaTotal && metaTotal > 0) {
          trackCount = metaTotal;
        } else if (hasNext && dataLength === 100) {
          // If there's a next page, paginate to count all tracks
          let totalCount = dataLength;
          let nextUrl: string | null = tracksData.next;
          while (nextUrl) {
            const nextResponse = await fetch(`https://api.music.apple.com${nextUrl}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!nextResponse.ok) break;
            const nextData = await nextResponse.json();
            totalCount += nextData.data?.length || 0;
            nextUrl = nextData.next || null;
            if (totalCount > 1000) break; // Safety limit
          }
          trackCount = totalCount;
        } else if (dataLength > 0) {
          trackCount = dataLength;
        }
      } else {
        console.error(`Failed to fetch playlist tracks: ${tracksResponse.status}`);
      }
    } catch (e) {
      console.error("Failed to fetch track count from meta:", e);
    }
    
    // Final fallback to relationships.tracks.data.length if still 0
    if (!trackCount && playlist.relationships?.tracks?.data?.length) {
      trackCount = playlist.relationships.tracks.data.length;
    }

    return {
      name: playlist.attributes?.name || "Unknown Playlist",
      trackCount,
      artworkUrl: playlist.attributes?.artwork?.url?.replace("{w}x{h}", "300x300") || null,
    };
  } catch (error) {
    console.error("Error fetching Apple playlist:", error);
    return null;
  }
}

router.get("/api/v1/venues/:code", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    
    const org = await storage.getOrganization(venue.organizationId);
    
    res.json({
      id: venue.id,
      code: venue.code,
      name: venue.name,
      organizationName: org?.name || "",
      logoUrl: org?.logoUrl,
      logoDarkUrl: org?.logoDarkUrl,
      primaryColor: org?.primaryColor,
      allowExplicit: venue.allowExplicit,
      blockHolidayMusic: venue.blockHolidayMusic,
      autoApprove: venue.autoApprove,
      dailyRequestLimit: venue.dailyRequestLimit,
      isActive: venue.isActive,
      songCooldownMinutes: venue.songCooldownMinutes ?? 120,
      artistCooldownMinutes: venue.artistCooldownMinutes ?? 30,
      artistMaxPlaysPerHour: venue.artistMaxPlaysPerHour ?? 3,
      announcementFrequencyType: venue.announcementFrequencyType,
      announcementFrequency: venue.announcementFrequency,
      announcementPlayMode: venue.announcementPlayMode,
    });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.get("/api/v1/venues/:code/queue", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    
    const queue = await storage.getQueueWithVotes(venue.id);
    
    res.json({
      items: queue.map(item => ({
        id: item.id,
        trackId: item.trackId,
        title: item.title,
        artist: item.artist,
        albumCover: item.albumCover,
        previewUrl: item.previewUrl,
        requesterName: item.requesterName,
        isAutoPlay: item.isAutoPlay,
        isExplicit: item.isExplicit,
        upvotes: item.upvotes,
        downvotes: item.downvotes,
        netVotes: item.netVotes,
        status: item.status,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.get("/api/v1/venues/:code/now-playing", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    
    res.json({
      trackId: venue.currentlyPlayingId,
      title: venue.currentlyPlayingTitle,
      artist: venue.currentlyPlayingArtist,
      albumCover: venue.currentlyPlayingAlbumCover,
      startedAt: venue.currentlyPlayingStartedAt?.toISOString() || null,
      duration: venue.currentlyPlayingDuration,
    });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Kiosk heartbeat - called periodically by kiosk page to indicate it's running
router.post("/api/v1/venues/:code/kiosk-heartbeat", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const { deviceId, deviceName, playbackStatus } = req.body;
    const now = new Date();
    
    // Check if another device has the lock (within last 90 seconds)
    const lockExpired = !venue.kioskLockHeartbeat || 
      (now.getTime() - venue.kioskLockHeartbeat.getTime()) > 90000;
    const hasLock = venue.kioskLockId === deviceId;
    const canAcquireLock = lockExpired || hasLock;

    if (canAcquireLock) {
      await storage.updateVenue(venue.id, {
        kioskLockId: deviceId,
        kioskLockHeartbeat: now,
        kioskPlaybackStatus: playbackStatus || "idle",
        kioskDeviceName: deviceName || "Unknown Device",
      });
      res.json({ 
        success: true, 
        hasLock: true,
        timestamp: now.toISOString() 
      });
    } else {
      // Another device has the lock
      res.json({ 
        success: true, 
        hasLock: false,
        lockedBy: venue.kioskDeviceName || "Another Device",
        timestamp: now.toISOString() 
      });
    }
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Get kiosk status - check if kiosk is online
router.get("/api/v1/venues/:code/kiosk-status", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const heartbeat = venue.kioskLockHeartbeat;
    const now = new Date();
    const isOnline = heartbeat && (now.getTime() - heartbeat.getTime()) < 60000;

    const withinSchedule = isVenueWithinSchedule(venue);
    const offlineDuringSchedule = withinSchedule && !isOnline;

    res.json({
      isOnline,
      lastHeartbeat: heartbeat?.toISOString() || null,
      playbackStatus: venue.kioskPlaybackStatus || "idle",
      deviceName: venue.kioskDeviceName || null,
      kioskScheduleEnabled: venue.kioskScheduleEnabled,
      kioskStartTime: venue.kioskStartTime,
      kioskEndTime: venue.kioskEndTime,
      kioskScheduleDays: venue.kioskScheduleDays,
      isWithinSchedule: withinSchedule,
      offlineDuringSchedule,
    });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Live Listeners Endpoints
// Register/heartbeat as a listener
router.post("/api/v1/venues/:code/listeners", async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { listenerId, name } = req.body;
    
    if (!listenerId) {
      return res.status(400).json({ error: "MISSING_LISTENER_ID", message: "Listener ID is required" });
    }
    
    const venue = await storage.getVenueByCode(code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    
    if (!liveListeners.has(code)) {
      liveListeners.set(code, new Map());
    }
    
    liveListeners.get(code)!.set(listenerId, { 
      name: name || "Anonymous", 
      lastHeartbeat: Date.now() 
    });
    
    res.json({ success: true, count: liveListeners.get(code)!.size });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Unregister as a listener
router.delete("/api/v1/venues/:code/listeners/:listenerId", async (req: Request, res: Response) => {
  try {
    const { code, listenerId } = req.params;
    
    if (liveListeners.has(code)) {
      liveListeners.get(code)!.delete(listenerId);
      if (liveListeners.get(code)!.size === 0) {
        liveListeners.delete(code);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Get live listener count and list
router.get("/api/v1/venues/:code/listeners", async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    
    const venue = await storage.getVenueByCode(code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    
    const listeners = liveListeners.get(code);
    if (!listeners || listeners.size === 0) {
      return res.json({ count: 0, listeners: [] });
    }
    
    const listenerList = Array.from(listeners.entries()).map(([id, data]) => ({
      id,
      name: data.name
    }));
    
    res.json({ count: listeners.size, listeners: listenerList });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/venues/:code/play/:requestId", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const requestId = parseInt(req.params.requestId);
    const songRequest = await storage.getRequest(requestId);
    
    if (!songRequest || songRequest.venueId !== venue.id) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Song request not found" });
    }

    await storage.updateRequest(requestId, { status: "playing" });
    
    await storage.updateVenue(venue.id, {
      currentlyPlayingId: songRequest.trackId,
      currentlyPlayingTitle: songRequest.title,
      currentlyPlayingArtist: songRequest.artist,
      currentlyPlayingAlbumCover: songRequest.albumCover,
      currentlyPlayingStartedAt: new Date(),
      currentlyPlayingDuration: songRequest.duration,
    });

    res.json({ success: true, message: "Now playing", previewUrl: songRequest.previewUrl });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/venues/:code/played/:requestId", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const requestId = parseInt(req.params.requestId);
    const songRequest = await storage.getRequest(requestId);
    
    if (!songRequest || songRequest.venueId !== venue.id) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Song request not found" });
    }

    await storage.updateRequest(requestId, { status: "played", playedAt: new Date() });
    
    await storage.updateVenue(venue.id, {
      currentlyPlayingId: null,
      currentlyPlayingTitle: null,
      currentlyPlayingArtist: null,
      currentlyPlayingAlbumCover: null,
      currentlyPlayingStartedAt: null,
      currentlyPlayingDuration: null,
    });

    res.json({ success: true, message: "Song marked as played" });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.delete("/api/v1/venues/:code/queue", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = await storage.getOrganization(venue.organizationId);
    if (!org || org.ownerId !== userId) {
      const members = await storage.getOrganizationMembers(org?.id || 0);
      const isMember = members.some((m: any) => m.authUserId === userId);
      if (!isMember) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Not authorized" });
      }
    }

    const pendingRequests = await storage.getRequestsByVenue(venue.id, "pending");
    const approvedRequests = await storage.getRequestsByVenue(venue.id, "approved");
    const allToClear = [...pendingRequests, ...approvedRequests];

    for (const request of allToClear) {
      await storage.updateRequest(request.id, { status: "played", playedAt: new Date() });
    }

    res.json({ success: true, cleared: allToClear.length });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.patch("/api/v1/venues/:code/requests/:requestId", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = await storage.getOrganization(venue.organizationId);
    if (!org || org.ownerId !== userId) {
      const members = await storage.getOrganizationMembers(org?.id || 0);
      const isMember = members.some((m: any) => m.authUserId === userId);
      if (!isMember) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Not authorized" });
      }
    }

    const requestId = parseInt(req.params.requestId);
    const songRequest = await storage.getRequest(requestId);
    if (!songRequest || songRequest.venueId !== venue.id) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Request not found" });
    }

    const { action } = req.body;
    if (!["approve", "reject", "remove"].includes(action)) {
      return res.status(400).json({ error: "INVALID_ACTION", message: "Action must be approve, reject, or remove" });
    }

    if (!["pending", "approved"].includes(songRequest.status)) {
      return res.status(400).json({ error: "INVALID_STATE", message: "Can only modify pending or approved requests" });
    }

    if (action === "approve") {
      await storage.updateRequest(requestId, { status: "approved" });
    } else if (action === "reject") {
      await storage.updateRequest(requestId, { status: "rejected" });
    } else if (action === "remove") {
      await storage.updateRequest(requestId, { status: "rejected" });
    }

    res.json({ success: true, action });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/venues/:code/request", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    const guestToken = req.headers["x-guest-token"] as string;
    
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = apiKey ? await validateApiKey(apiKey) : null;
    const guest = guestToken ? await validateGuestToken(guestToken, venue.id) : null;

    if (!org && !guest) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Valid guest token or API key required" });
    }

    if (org && org.id !== venue.organizationId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    const { trackId, title, artist, album, albumCover, duration, isExplicit, previewUrl, requesterName } = req.body;

    if (!trackId || !title || !artist) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "trackId, title, and artist are required" });
    }

    if (!venue.allowExplicit && isExplicit === true) {
      return res.status(400).json({ error: "EXPLICIT_NOT_ALLOWED", message: "This venue does not allow explicit content" });
    }

    // Check if song is banned
    const isBanned = await storage.isSongBanned(venue.id, trackId);
    if (isBanned) {
      return res.status(400).json({ error: "SONG_BANNED", message: "This song has been banned at this venue" });
    }

    const songCooldown = venue.songCooldownMinutes ?? 120;
    if (songCooldown > 0) {
      const wasPlayedRecently = await storage.wasTrackPlayedRecentlyMinutes(venue.id, trackId, songCooldown);
      if (wasPlayedRecently) {
        const hours = Math.floor(songCooldown / 60);
        const mins = songCooldown % 60;
        const timeStr = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins} minutes`;
        return res.status(400).json({ 
          error: "SONG_PLAYED_RECENTLY", 
          message: `This song was played in the last ${timeStr}. Please choose a different song.` 
        });
      }
    }

    const artistCooldown = venue.artistCooldownMinutes ?? 30;
    const artistMaxPlays = venue.artistMaxPlaysPerHour ?? 3;
    if (artistCooldown > 0 && artistMaxPlays > 0 && artist) {
      const artistPlayCount = await storage.getArtistPlayCountRecent(venue.id, artist, artistCooldown);
      if (artistPlayCount >= artistMaxPlays) {
        const timeStr = artistCooldown >= 60 ? `${Math.floor(artistCooldown / 60)} hour${artistCooldown >= 120 ? 's' : ''}` : `${artistCooldown} minutes`;
        return res.status(400).json({
          error: "ARTIST_PLAYED_TOO_OFTEN",
          message: `This artist has been played ${artistMaxPlays} times in the last ${timeStr}. Try a different artist.`
        });
      }
    }

    const requestData: InsertRequest = {
      venueId: venue.id,
      trackId,
      title,
      artist,
      album,
      albumCover,
      duration,
      isExplicit: isExplicit === true,
      previewUrl,
      requesterName,
      status: venue.autoApprove ? "approved" : "pending",
    };

    if (guest) {
      const currentCount = guest.requestCount || 0;
      const limit = venue.dailyRequestLimit;
      
      // 0 or null means unlimited, otherwise enforce the limit
      if (limit !== null && limit !== 0 && currentCount >= limit) {
        return res.status(400).json({ 
          error: "LIMIT_REACHED", 
          message: `You have reached your request limit of ${limit} songs in queue` 
        });
      }
      
      requestData.requestedByGuestId = guest.id;
      requestData.requesterName = guest.name;
      await storage.updateGuest(guest.id, { requestCount: currentCount + 1, lastActiveAt: new Date() });
    }

    const request = await storage.createRequest(requestData);

    res.json({
      success: true,
      requestId: request.id,
      message: "Song added to queue",
    });
  } catch (error) {
    console.error("Request error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/venues/:code/vote", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    const guestToken = req.headers["x-guest-token"] as string;
    const { requestId, voteType = "up" } = req.body;

    if (!requestId || typeof requestId !== "number") {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "requestId is required" });
    }

    if (voteType !== "up" && voteType !== "down") {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "voteType must be 'up' or 'down'" });
    }

    const songRequest = await storage.getRequest(requestId);
    if (!songRequest) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Request not found" });
    }

    const venue = await storage.getVenue(songRequest.venueId);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = apiKey ? await validateApiKey(apiKey) : null;
    const guest = guestToken ? await validateGuestToken(guestToken, venue.id) : null;

    if (!org && !guest) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Valid guest token or API key required" });
    }

    if (org && org.id !== venue.organizationId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    if (guest) {
      const existingVoteType = await storage.getVoteType(requestId, undefined, guest.id);
      
      if (existingVoteType) {
        if (existingVoteType === voteType) {
          await storage.removeVote(requestId, undefined, guest.id);
          const votes = await storage.getVotesByRequest(requestId);
          const upvotes = votes.filter(v => v.voteType === "up").length;
          const downvotes = votes.filter(v => v.voteType === "down").length;
          return res.json({ success: true, upvotes, downvotes, netVotes: upvotes - downvotes, action: "removed" });
        } else {
          await storage.updateVoteType(requestId, voteType, undefined, guest.id);
          const votes = await storage.getVotesByRequest(requestId);
          const upvotes = votes.filter(v => v.voteType === "up").length;
          const downvotes = votes.filter(v => v.voteType === "down").length;
          return res.json({ success: true, upvotes, downvotes, netVotes: upvotes - downvotes, action: "changed" });
        }
      }
      
      await storage.createVote({ requestId, guestId: guest.id, voteType });
      await storage.updateGuest(guest.id, { lastActiveAt: new Date() });
    } else {
      await storage.createVote({ requestId, voteType });
    }

    const votes = await storage.getVotesByRequest(requestId);
    const upvotes = votes.filter(v => v.voteType === "up").length;
    const downvotes = votes.filter(v => v.voteType === "down").length;

    res.json({
      success: true,
      upvotes,
      downvotes,
      netVotes: upvotes - downvotes,
      action: "added",
    });
  } catch (error) {
    console.error("Vote error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.get("/api/v1/party/:partyCode", async (req: Request, res: Response) => {
  try {
    // First try to find by party session code
    let session = await storage.getPartySessionByCode(req.params.partyCode);
    let venue;
    
    if (!session || !session.isActive) {
      // Try to find by venue code instead
      venue = await storage.getVenueByCode(req.params.partyCode);
      if (venue) {
        const today = new Date().toISOString().split("T")[0];
        session = await storage.getActivePartySession(venue.id, today);
        
        // Create a new session if none exists for today
        if (!session) {
          const { nanoid } = await import("nanoid");
          session = await storage.createPartySession({
            venueId: venue.id,
            code: nanoid(8),
            date: today,
          });
        }
      }
    }
    
    if (!session || !session.isActive) {
      return res.status(404).json({ error: "PARTY_NOT_ACTIVE", message: "Party session not active" });
    }

    if (!venue) {
      venue = await storage.getVenue(session.venueId);
    }
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = await storage.getOrganization(venue.organizationId);
    const queue = await storage.getQueueWithVotes(venue.id);
    const recentlyPlayed = await storage.getPlayHistory(venue.id, 20);

    res.json({
      venue: {
        code: venue.code,
        name: venue.name,
        allowExplicit: venue.allowExplicit,
        blockHolidayMusic: venue.blockHolidayMusic,
        dailyRequestLimit: venue.dailyRequestLimit,
      },
      branding: {
        organizationName: org?.name || "",
        logoUrl: org?.logoUrl,
        primaryColor: org?.primaryColor,
      },
      nowPlaying: {
        trackId: venue.currentlyPlayingId,
        title: venue.currentlyPlayingTitle,
        artist: venue.currentlyPlayingArtist,
        albumCover: venue.currentlyPlayingAlbumCover,
      },
      queue: queue.map(item => ({
        id: item.id,
        trackId: item.trackId,
        title: item.title,
        artist: item.artist,
        albumCover: item.albumCover,
        isExplicit: item.isExplicit,
        requesterName: item.requesterName,
        requestedByGuestId: item.requestedByGuestId,
        isAutoPlay: item.isAutoPlay || false,
        upvotes: item.upvotes,
        downvotes: item.downvotes,
        netVotes: item.netVotes,
      })),
      recentlyPlayed: recentlyPlayed.slice(0, 20).map(item => ({
        id: item.id,
        trackId: item.trackId,
        title: item.title,
        artist: item.artist,
        albumCover: item.albumCover,
        playedAt: item.playedAt,
        requesterName: item.requesterName,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/party/:partyCode/join", async (req: Request, res: Response) => {
  try {
    // First try to find by party session code
    let session = await storage.getPartySessionByCode(req.params.partyCode);
    let venue;
    
    if (!session || !session.isActive) {
      // Try to find by venue code instead
      venue = await storage.getVenueByCode(req.params.partyCode);
      if (venue) {
        const today = new Date().toISOString().split("T")[0];
        session = await storage.getActivePartySession(venue.id, today);
        
        // Create a new session if none exists for today
        if (!session) {
          session = await storage.createPartySession({
            venueId: venue.id,
            code: nanoid(8),
            date: today,
          });
        }
      }
    }
    
    if (!session || !session.isActive) {
      return res.status(404).json({ error: "PARTY_NOT_ACTIVE", message: "Party session not active" });
    }

    if (!venue) {
      venue = await storage.getVenue(session.venueId);
    }
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "Name is required" });
    }

    const sessionToken = nanoid(32);
    const guest = await storage.createGuest({
      partySessionId: session.id,
      name: name.trim().slice(0, 50),
      sessionToken,
    });

    res.json({
      success: true,
      sessionToken,
      guestId: guest.id,
      requestsRemaining: (venue?.dailyRequestLimit === 0 || venue?.dailyRequestLimit === null) ? null : venue?.dailyRequestLimit,
    });
  } catch (error) {
    console.error("Join error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.get("/api/v1/venues/:code/qrcode", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const today = new Date().toISOString().split("T")[0];
    let session = await storage.getActivePartySession(venue.id, today);

    if (!session) {
      const partyCode = nanoid(8);
      session = await storage.createPartySession({
        venueId: venue.id,
        code: partyCode,
        date: today,
      });
    }

    // Use custom domain in production, dev domain in development
    let baseUrl: string;
    if (process.env.NODE_ENV === "production") {
      baseUrl = "https://jukboks.com";
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else {
      baseUrl = "http://localhost:5000";
    }
    const partyUrl = `${baseUrl}/party/${session.code}`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(partyUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#ffffff", light: "#00000000" },
    });

    res.json({
      qrCode: qrCodeDataUrl,
      partyUrl,
      partyCode: session.code,
    });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/setup/demo", async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEMO_SETUP) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Demo setup not available in production" });
    }

    let org = await storage.getOrganizationBySlug("demo");
    
    if (!org) {
      org = await storage.createOrganization({
        name: "Demo Organization",
        slug: "demo",
        primaryColor: "#2563eb",
        accentColor: "#f59e0b",
        apiKey: nanoid(32),
      });
    }

    let venue = await storage.getVenueByCode("demo-venue");
    
    if (!venue) {
      venue = await storage.createVenue({
        organizationId: org.id,
        name: "Demo Venue",
        code: "demo-venue",
        allowExplicit: false,
        autoApprove: true,
        dailyRequestLimit: 10,
      });
    }

    const today = new Date().toISOString().split("T")[0];
    let session = await storage.getActivePartySession(venue.id, today);

    if (!session) {
      session = await storage.createPartySession({
        venueId: venue.id,
        code: nanoid(8),
        date: today,
      });
    }

    res.json({
      success: true,
      organization: { id: org.id, name: org.name, slug: org.slug },
      venue: { id: venue.id, name: venue.name, code: venue.code },
      partySession: { id: session.id, code: session.code },
    });
  } catch (error) {
    console.error("Setup error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to setup demo" });
  }
});

router.get("/api/v1/search", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org) {
      return res.status(401).json({ error: "INVALID_API_KEY", message: "Valid API key required" });
    }

    const { term } = req.query;
    if (!term || typeof term !== "string") {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "Search term required" });
    }

    const searchLimit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 50));
    const searchOffset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=${searchLimit}&offset=${searchOffset}`
    );
    const data = await response.json();

    const songs = (data.results || []).map((r: any) => ({
      trackId: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName,
      albumCover: r.artworkUrl100?.replace("100x100", "300x300"),
      duration: r.trackTimeMillis,
      isExplicit: r.trackExplicitness === "explicit",
      previewUrl: r.previewUrl,
    }));

    res.json({ results: songs, total: data.resultCount });
  } catch (error) {
    console.error("API search error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Search failed" });
  }
});

router.get("/api/v1/venues", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org) {
      return res.status(401).json({ error: "INVALID_API_KEY", message: "Valid API key required" });
    }

    const orgVenues = await storage.getVenuesByOrganization(org.id);
    const venueList = orgVenues.map(v => ({
      id: v.id,
      code: v.code,
      name: v.name,
      isActive: v.isActive,
      allowExplicit: v.allowExplicit,
      autoApprove: v.autoApprove,
      dailyRequestLimit: v.dailyRequestLimit,
    }));

    res.json({ venues: venueList });
  } catch (error) {
    console.error("API venues error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.get("/api/v1/venues/:code/history", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org) {
      return res.status(401).json({ error: "INVALID_API_KEY", message: "Valid API key required" });
    }

    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    if (venue.organizationId !== org.id) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 50, 100));
    const history = await storage.getPlayHistory(venue.id, limit);
    const songs = history.map(r => ({
      id: r.id,
      trackId: r.trackId,
      title: r.title,
      artist: r.artist,
      album: r.album,
      albumCover: r.albumCover,
      requesterName: r.requesterName,
      isAutoPlay: r.isAutoPlay,
      playedAt: r.playedAt,
    }));

    res.json({ history: songs });
  } catch (error) {
    console.error("API history error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/venues/:code/announce", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org) {
      return res.status(401).json({ error: "INVALID_API_KEY", message: "Valid API key required" });
    }

    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    if (venue.organizationId !== org.id) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    const { message, audioUrl } = req.body;
    if (!message && !audioUrl) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "Either 'message' (text-to-speech) or 'audioUrl' is required" });
    }
    if (message && typeof message !== "string") {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "'message' must be a string" });
    }
    if (message && message.length > 500) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "'message' must be 500 characters or less" });
    }
    if (audioUrl) {
      if (typeof audioUrl !== "string" || audioUrl.length > 2000) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "'audioUrl' must be a valid URL string (max 2000 chars)" });
      }
      if (!audioUrl.startsWith("https://")) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "'audioUrl' must be an HTTPS URL" });
      }
    }

    await storage.updateVenue(venue.id, {
      urgentAnnouncementText: message || null,
      urgentAnnouncementAudioUrl: audioUrl || null,
      urgentAnnouncementTriggeredAt: new Date(),
    });

    res.json({
      success: true,
      message: "Urgent announcement queued. It will play on the kiosk after the current song ends.",
    });
  } catch (error) {
    console.error("Trigger announcement error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.delete("/api/v1/venues/:code/announce", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org) {
      return res.status(401).json({ error: "INVALID_API_KEY", message: "Valid API key required" });
    }

    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    if (venue.organizationId !== org.id) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    await storage.updateVenue(venue.id, {
      urgentAnnouncementText: null,
      urgentAnnouncementAudioUrl: null,
      urgentAnnouncementTriggeredAt: null,
    });

    res.json({ success: true, message: "Pending urgent announcement cancelled" });
  } catch (error) {
    console.error("Cancel announcement error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.patch("/api/v1/venues/:code/settings", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org || org.id !== venue.organizationId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    const { allowExplicit, dailyRequestLimit, autoApprove, autoPlayEnabled, songCooldownMinutes, artistCooldownMinutes, artistMaxPlaysPerHour } = req.body;
    
    const updates: Partial<typeof venue> = {};
    if (typeof allowExplicit === "boolean") updates.allowExplicit = allowExplicit;
    if (typeof autoApprove === "boolean") updates.autoApprove = autoApprove;
    if (typeof autoPlayEnabled === "boolean") updates.autoPlayEnabled = autoPlayEnabled;
    if (typeof dailyRequestLimit === "number" && dailyRequestLimit >= 0 && dailyRequestLimit <= 100) {
      updates.dailyRequestLimit = dailyRequestLimit;
    }
    if (typeof songCooldownMinutes === "number" && songCooldownMinutes >= 0 && songCooldownMinutes <= 1440) {
      updates.songCooldownMinutes = songCooldownMinutes;
    }
    if (typeof artistCooldownMinutes === "number" && artistCooldownMinutes >= 0 && artistCooldownMinutes <= 1440) {
      updates.artistCooldownMinutes = artistCooldownMinutes;
    }
    if (typeof artistMaxPlaysPerHour === "number" && artistMaxPlaysPerHour >= 0 && artistMaxPlaysPerHour <= 20) {
      updates.artistMaxPlaysPerHour = artistMaxPlaysPerHour;
    }

    const updated = await storage.updateVenue(venue.id, updates);
    res.json({ success: true, venue: updated });
  } catch (error) {
    console.error("Settings update error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.get("/api/v1/venues/:code/backup-playlists", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const playlists = await storage.getBackupPlaylistsByVenue(venue.id);
    res.json({ playlists });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Helper function to pick a playlist using weighted random selection
function pickWeightedPlaylist(playlists: any[]) {
  const totalWeight = playlists.reduce((sum, p) => sum + (p.weight || 3), 0);
  let random = Math.random() * totalWeight;
  for (const playlist of playlists) {
    random -= (playlist.weight || 3);
    if (random <= 0) {
      return playlist;
    }
  }
  return playlists[0];
}

// Fill queue with songs from backup playlists for auto-play
router.post("/api/v1/venues/:code/auto-play", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const playlists = await storage.getBackupPlaylistsByVenue(venue.id);
    if (playlists.length === 0) {
      return res.status(404).json({ error: "NO_PLAYLISTS", message: "No backup playlists configured" });
    }

    // Check current queue and count auto-play songs
    const currentQueue = await storage.getQueueWithVotes(venue.id);
    const autoPlayInQueue = currentQueue.filter(item => item.isAutoPlay);
    const trackIdsInQueue = new Set(currentQueue.map(item => item.trackId));
    
    // Target: keep 5 backup songs in queue
    const TARGET_BACKUP_SONGS = 5;
    const songsToAdd = Math.max(0, TARGET_BACKUP_SONGS - autoPlayInQueue.length);
    
    if (songsToAdd === 0) {
      return res.json({ success: true, message: "Queue already has enough backup songs", added: 0 });
    }
    
    const token = await getAppleMusicToken();
    if (!token) {
      return res.status(500).json({ error: "TOKEN_ERROR", message: "Could not get Apple Music token" });
    }

    // Get banned songs once
    const bannedSongs = await storage.getBannedSongs(venue.id);
    const bannedTrackIds = new Set(bannedSongs.map(s => s.trackId));
    
    // Pre-fetch tracks from all playlists once for efficiency
    const playlistTracks: Map<number, { playlist: any, tracks: any[] }> = new Map();
    for (const playlist of playlists) {
      let tracks: any[] = [];
      let nextUrl: string | null = `https://api.music.apple.com/v1/catalog/us/playlists/${playlist.applePlaylistId}/tracks?limit=100`;
      
      let pageNum = 0;
      while (nextUrl && tracks.length < 500) {
        pageNum++;
        const response = await fetch(nextUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          console.error(`Failed to fetch playlist ${playlist.applePlaylistId}: ${response.status} ${response.statusText}`);
          const errorText = await response.text().catch(() => "");
          console.error("Error response:", errorText.substring(0, 500));
          break;
        }
        const data = await response.json();
        const batchSize = data.data?.length || 0;
        tracks = tracks.concat(data.data || []);
        const hasNext = !!data.next;
        nextUrl = data.next ? `https://api.music.apple.com${data.next}` : null;
      }
      
      if (tracks.length > 0) {
        playlistTracks.set(playlist.id, { playlist, tracks });
      } else {
        console.warn(`Playlist ${playlist.name} has no tracks after fetching`);
      }
    }
    
    if (playlistTracks.size === 0) {
      return res.status(404).json({ error: "NO_TRACKS", message: "No tracks available in any playlist" });
    }
    
    // Build a consolidated candidate pool with weighted selection
    // Each track is paired with its playlist and weighted by playlist weight
    interface CandidateTrack {
      track: any;
      playlist: any;
      weight: number;
    }
    
    const candidatePool: CandidateTrack[] = [];
    const usedTrackIds = new Set(trackIdsInQueue);
    
    // First pass: filter all tracks for basic criteria (banned, explicit, duplicates)
    for (const [_, { playlist, tracks }] of playlistTracks) {
      const playlistWeight = playlist.weight || 3;
      for (const track of tracks) {
        if (usedTrackIds.has(track.id)) continue;
        if (bannedTrackIds.has(track.id)) continue;
        if (!venue.allowExplicit && track.attributes?.contentRating === "explicit") continue;
        candidatePool.push({ track, playlist, weight: playlistWeight });
      }
    }
    
    if (candidatePool.length === 0) {
      return res.status(404).json({ error: "NO_AVAILABLE_TRACKS", message: "No available tracks after filtering" });
    }
    
    // Second pass: filter for recently played and sample without replacement
    const addedSongs: any[] = [];
    const availableCandidates = [...candidatePool];
    
    // Track last artist to prevent back-to-back same artist
    // Start with the last song in queue or last played song
    let lastArtist: string | null = null;
    if (currentQueue.length > 0) {
      lastArtist = currentQueue[currentQueue.length - 1].artist?.toLowerCase() || null;
    } else {
      // Check recently played if queue is empty
      const recentlyPlayed = await storage.getPlayHistory(venue.id, 1);
      if (recentlyPlayed.length > 0) {
        lastArtist = recentlyPlayed[0].artist?.toLowerCase() || null;
      }
    }
    
    while (addedSongs.length < songsToAdd && availableCandidates.length > 0) {
      // Weighted random selection from available candidates
      const totalWeight = availableCandidates.reduce((sum, c) => sum + c.weight, 0);
      let random = Math.random() * totalWeight;
      let selectedIdx = 0;
      
      for (let i = 0; i < availableCandidates.length; i++) {
        random -= availableCandidates[i].weight;
        if (random <= 0) {
          selectedIdx = i;
          break;
        }
      }
      
      const selected = availableCandidates[selectedIdx];
      availableCandidates.splice(selectedIdx, 1);
      
      const songCooldown = venue.songCooldownMinutes ?? 120;
      const wasPlayedRecently = await storage.wasTrackPlayedRecentlyMinutes(venue.id, selected.track.id, songCooldown);
      if (wasPlayedRecently) continue;
      
      const attrs = selected.track.attributes;
      const trackArtist = attrs.artistName?.toLowerCase() || "";

      const artistCooldown = venue.artistCooldownMinutes ?? 30;
      const artistMaxPlays = venue.artistMaxPlaysPerHour ?? 3;
      if (trackArtist && artistCooldown > 0 && artistMaxPlays > 0) {
        const artistPlayCount = await storage.getArtistPlayCountRecent(venue.id, trackArtist, artistCooldown);
        if (artistPlayCount >= artistMaxPlays) continue;
      }
      
      if (lastArtist && trackArtist === lastArtist) {
        // Put it back at the end so it might be selected later
        availableCandidates.push(selected);
        continue;
      }
      
      usedTrackIds.add(selected.track.id);
      lastArtist = trackArtist; // Update last artist for next iteration

      // Create a request for the song
      const request = await storage.createRequest({
        venueId: venue.id,
        trackId: selected.track.id,
        title: attrs.name,
        artist: attrs.artistName,
        album: attrs.albumName || "",
        albumCover: attrs.artwork?.url?.replace("{w}x{h}", "300x300") || "",
        previewUrl: attrs.previews?.[0]?.url || "",
        duration: attrs.durationInMillis || 0,
        isExplicit: attrs.contentRating === "explicit",
        isAutoPlay: true,
        status: "approved",
      });
      
      addedSongs.push({ request, playlistName: selected.playlist.name });
    }

    if (addedSongs.length === 0) {
      return res.status(404).json({ error: "NO_AVAILABLE_TRACKS", message: "All tracks were recently played" });
    }

    res.json({ success: true, added: addedSongs.length, songs: addedSongs });
  } catch (error) {
    console.error("Auto-play error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/venues/:code/backup-playlists", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org || org.id !== venue.organizationId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    const count = await storage.getBackupPlaylistCount(venue.id);
    if (count >= 10) {
      return res.status(400).json({ error: "MAX_PLAYLISTS_REACHED", message: "Maximum of 10 backup playlists allowed" });
    }

    const { name, applePlaylistId, trackCount, artworkUrl } = req.body;
    if (!name || !applePlaylistId) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "name and applePlaylistId are required" });
    }

    const playlist = await storage.createBackupPlaylist({
      venueId: venue.id,
      name,
      applePlaylistId,
      trackCount: trackCount || 0,
      artworkUrl,
      position: count,
    });

    res.json({ success: true, playlist });
  } catch (error) {
    console.error("Add playlist error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.delete("/api/v1/venues/:code/backup-playlists/:playlistId", async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-jukboks-api-key"] as string;
    
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = apiKey ? await validateApiKey(apiKey) : null;
    if (!org || org.id !== venue.organizationId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "API key not authorized for this venue" });
    }

    const playlistId = parseInt(req.params.playlistId);
    await storage.deleteBackupPlaylist(playlistId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// ============================================
// AUTHENTICATED USER ROUTES
// ============================================

// Get or create user's organization
router.get("/api/me/organization", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let org = await storage.getOrganizationByOwnerId(userId);
    
    if (!org) {
      // Create a new organization for this user
      const userEmail = req.user?.claims?.email || "";
      const userName = req.user?.claims?.first_name || userEmail.split("@")[0] || "My";
      const slug = `${userName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${nanoid(6)}`;
      
      org = await storage.createOrganization({
        ownerId: userId,
        name: `${userName}'s Organization`,
        slug,
        subscriptionStatus: "free",
        subscriptionPlan: "free",
      });
    }

    res.json(org);
  } catch (error) {
    console.error("Error getting organization:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Update organization branding (owner only)
router.patch("/api/me/organization", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const org = await storage.getOrganizationByOwnerId(userId);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Only organization owners can update branding" });
    }

    const { name, logoUrl, logoDarkUrl, primaryColor, accentColor } = req.body;
    
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;
    if (logoDarkUrl !== undefined) updates.logoDarkUrl = logoDarkUrl;
    if (primaryColor !== undefined) updates.primaryColor = primaryColor;
    if (accentColor !== undefined) updates.accentColor = accentColor;

    const updated = await storage.updateOrganization(org.id, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating organization:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Helper to get user's organization (as owner or member)
async function getUserOrganization(userId: string, userEmail: string) {
  let org = await storage.getOrganizationByOwnerId(userId);
  if (org) return { org, isOwner: true };
  
  const memberOrgs = await storage.getOrganizationsByMemberAuthId(userId);
  if (memberOrgs.length > 0) {
    return { org: memberOrgs[0], isOwner: false };
  }
  
  const emailOrgs = await storage.getOrganizationsByMemberEmail(userEmail);
  if (emailOrgs.length > 0) {
    const member = await storage.getOrganizationMemberByEmail(emailOrgs[0].id, userEmail);
    if (member && !member.authUserId) {
      await storage.updateOrganizationMember(member.id, { authUserId: userId, joinedAt: new Date() });
    }
    return { org: emailOrgs[0], isOwner: false };
  }
  
  return { org: null, isOwner: false };
}

// Get user's venues
router.get("/api/me/venues", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.json([]);
    }

    const venues = await storage.getVenuesByOrganization(org.id);
    res.json(venues);
  } catch (error) {
    console.error("Error getting venues:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Create a new venue
router.post("/api/me/venues", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user's organization (as owner or member)
    let { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      // Create a new organization for this user
      const userName = req.user?.claims?.first_name || userEmail.split("@")[0] || "My";
      const slug = `${userName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${nanoid(6)}`;
      
      org = await storage.createOrganization({
        ownerId: userId,
        name: `${userName}'s Organization`,
        slug,
        subscriptionStatus: "free",
        subscriptionPlan: "free",
      });
    }

    const { name, allowExplicit, autoApprove, dailyRequestLimit } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Venue name is required" });
    }

    // Generate unique venue code
    const code = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20)}-${nanoid(6)}`;

    const venue = await storage.createVenue({
      organizationId: org.id,
      name: name.trim(),
      code,
      isActive: true,
      allowExplicit: allowExplicit ?? false,
      autoApprove: autoApprove ?? true,
      dailyRequestLimit: dailyRequestLimit ?? 5,
    });

    // Create a party session for this venue
    const today = new Date().toISOString().split("T")[0];
    const partyCode = nanoid(8);
    await storage.createPartySession({
      venueId: venue.id,
      date: today,
      code: partyCode,
      isActive: true,
    });

    res.json(venue);
  } catch (error) {
    console.error("Error creating venue:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Update a venue
router.patch("/api/me/venues/:venueId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Organization not found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Venue not found" });
    }

    const { name, allowExplicit, blockHolidayMusic, autoApprove, dailyRequestLimit, isActive, songCooldownMinutes, artistCooldownMinutes, artistMaxPlaysPerHour } = req.body;
    
    const updatedVenue = await storage.updateVenue(venueId, {
      ...(name !== undefined && { name }),
      ...(allowExplicit !== undefined && { allowExplicit }),
      ...(blockHolidayMusic !== undefined && { blockHolidayMusic }),
      ...(autoApprove !== undefined && { autoApprove }),
      ...(dailyRequestLimit !== undefined && { dailyRequestLimit }),
      ...(isActive !== undefined && { isActive }),
      ...(songCooldownMinutes !== undefined && typeof songCooldownMinutes === "number" && songCooldownMinutes >= 0 && songCooldownMinutes <= 1440 && { songCooldownMinutes }),
      ...(artistCooldownMinutes !== undefined && typeof artistCooldownMinutes === "number" && artistCooldownMinutes >= 0 && artistCooldownMinutes <= 1440 && { artistCooldownMinutes }),
      ...(artistMaxPlaysPerHour !== undefined && typeof artistMaxPlaysPerHour === "number" && artistMaxPlaysPerHour >= 0 && artistMaxPlaysPerHour <= 20 && { artistMaxPlaysPerHour }),
    });

    res.json(updatedVenue);
  } catch (error) {
    console.error("Error updating venue:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Delete venue
router.delete("/api/me/venues/:venueId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Organization not found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Venue not found" });
    }

    await storage.deleteVenue(venueId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting venue:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Get team members
router.get("/api/me/team", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org, isOwner } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.json({ members: [], isOwner: false });
    }

    const members = await storage.getOrganizationMembers(org.id);
    res.json({ members, isOwner, organizationName: org.name });
  } catch (error) {
    console.error("Error getting team:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Invite team member (owner only)
router.post("/api/me/team", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const org = await storage.getOrganizationByOwnerId(userId);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Only organization owners can invite members" });
    }

    const { email, role = "admin" } = req.body;
    if (!email) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Email is required" });
    }

    // Check if already a member
    const existing = await storage.getOrganizationMemberByEmail(org.id, email);
    if (existing) {
      return res.status(400).json({ error: "ALREADY_MEMBER", message: "This email is already a team member" });
    }

    const member = await storage.createOrganizationMember({
      organizationId: org.id,
      email: email.toLowerCase(),
      role,
    });

    res.json(member);
  } catch (error) {
    console.error("Error inviting team member:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Remove team member (owner only)
router.delete("/api/me/team/:memberId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const org = await storage.getOrganizationByOwnerId(userId);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Only organization owners can remove members" });
    }

    const memberId = parseInt(req.params.memberId);
    
    // Verify member belongs to this organization
    const members = await storage.getOrganizationMembers(org.id);
    const memberToDelete = members.find(m => m.id === memberId);
    if (!memberToDelete) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Member not found" });
    }

    await storage.deleteOrganizationMember(memberId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing team member:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Backup playlists for authenticated users
router.post("/api/me/venues/:venueId/backup-playlists", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const count = await storage.getBackupPlaylistCount(venue.id);
    if (count >= 10) {
      return res.status(400).json({ error: "MAX_PLAYLISTS_REACHED", message: "Maximum of 10 backup playlists allowed" });
    }

    const { playlistUrl, playlistId, isLibrary, name, trackCount, artworkUrl } = req.body;
    
    let applePlaylistId: string;
    let playlistName: string;
    let playlistTrackCount: number;
    let playlistArtworkUrl: string | null;
    
    if (playlistId) {
      // Direct playlist ID from search results - use as-is since it already has the correct format
      applePlaylistId = playlistId;
      
      // Reject personal/library playlists - they can't be accessed with a developer token
      if (isLibrary || applePlaylistId.startsWith('p.') && !applePlaylistId.startsWith('pl.')) {
        return res.status(400).json({ 
          error: "PERSONAL_PLAYLIST", 
          message: "Personal playlists cannot be used for backup. Please use a public Apple Music playlist (from Browse or search results that start with 'pl.')." 
        });
      }
      
      {
        // Always fetch from Apple Music API for catalog playlists
        // Search results don't include trackCount, so we need to fetch full details
        const playlistDetails = await fetchApplePlaylistDetails(applePlaylistId);
        playlistName = playlistDetails?.name || name || "Apple Music Playlist";
        playlistTrackCount = playlistDetails?.trackCount || 0;
        playlistArtworkUrl = playlistDetails?.artworkUrl || artworkUrl || null;
      }
    } else if (playlistUrl) {
      // Extract playlist ID from Apple Music URL
      const urlMatch = playlistUrl.match(/playlist\/[^\/]+\/pl\.([a-zA-Z0-9-]+)/);
      if (!urlMatch) {
        return res.status(400).json({ error: "INVALID_URL", message: "Invalid Apple Music playlist URL" });
      }
      applePlaylistId = `pl.${urlMatch[1]}`;
      
      // Fetch details from Apple Music for URL-based playlists
      const playlistDetails = await fetchApplePlaylistDetails(applePlaylistId);
      playlistName = playlistDetails?.name || "Apple Music Playlist";
      playlistTrackCount = playlistDetails?.trackCount || 0;
      playlistArtworkUrl = playlistDetails?.artworkUrl || null;
    } else {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "playlistUrl or playlistId is required" });
    }

    const playlist = await storage.createBackupPlaylist({
      venueId: venue.id,
      name: playlistName,
      applePlaylistId,
      trackCount: playlistTrackCount,
      artworkUrl: playlistArtworkUrl,
      position: count,
    });

    res.json({ success: true, playlist });
  } catch (error) {
    console.error("Add playlist error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.delete("/api/me/venues/:venueId/backup-playlists/:playlistId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const playlistIdParam = req.params.playlistId;
    const playlists = await storage.getBackupPlaylistsByVenue(venue.id);
    const playlist = playlists.find(p => p.applePlaylistId === playlistIdParam || p.id === parseInt(playlistIdParam));
    
    if (!playlist) {
      return res.status(404).json({ error: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
    }

    await storage.deleteBackupPlaylist(playlist.id);

    res.json({ success: true });
  } catch (error) {
    console.error("Remove playlist error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.patch("/api/me/venues/:venueId/backup-playlists/:playlistId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const playlistIdParam = req.params.playlistId;
    const playlists = await storage.getBackupPlaylistsByVenue(venue.id);
    const playlist = playlists.find(p => p.applePlaylistId === playlistIdParam || p.id === parseInt(playlistIdParam));
    
    if (!playlist) {
      return res.status(404).json({ error: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
    }

    const { weight } = req.body;
    if (weight !== undefined) {
      const validWeight = Math.max(1, Math.min(5, parseInt(weight) || 3));
      await storage.updateBackupPlaylist(playlist.id, { weight: validWeight });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Update playlist error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// ==================== Announcement Groups ====================

// Get all announcement groups with their announcements for a venue
router.get("/api/me/venues/:venueId/announcement-groups", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const groups = await storage.getAnnouncementGroupsByVenue(venue.id);
    const groupsWithAnnouncements = await Promise.all(
      groups.map(async (group) => {
        const announcements = await storage.getAnnouncementsByGroup(group.id);
        return { ...group, announcements };
      })
    );

    res.json({ groups: groupsWithAnnouncements });
  } catch (error) {
    console.error("Get announcement groups error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Create a new announcement group
router.post("/api/me/venues/:venueId/announcement-groups", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const { name, frequencyType, frequency, playMode } = req.body;
    
    const existingGroups = await storage.getAnnouncementGroupsByVenue(venue.id);
    
    const group = await storage.createAnnouncementGroup({
      venueId: venue.id,
      name: name || "Announcements",
      frequencyType: frequencyType || "songs",
      frequency: frequency || 5,
      playMode: playMode || "sequential",
      position: existingGroups.length,
    });

    res.json({ success: true, group: { ...group, announcements: [] } });
  } catch (error) {
    console.error("Create announcement group error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Update an announcement group
router.patch("/api/me/venues/:venueId/announcement-groups/:groupId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const groupId = parseInt(req.params.groupId);
    const group = await storage.getAnnouncementGroup(groupId);
    if (!group || group.venueId !== venue.id) {
      return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Announcement group not found" });
    }

    const { name, frequencyType, frequency, playMode } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (frequencyType !== undefined) updateData.frequencyType = frequencyType;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (playMode !== undefined) updateData.playMode = playMode;

    const updated = await storage.updateAnnouncementGroup(groupId, updateData);
    const announcements = await storage.getAnnouncementsByGroup(groupId);
    res.json({ success: true, group: { ...updated, announcements } });
  } catch (error) {
    console.error("Update announcement group error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Delete an announcement group
router.delete("/api/me/venues/:venueId/announcement-groups/:groupId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const groupId = parseInt(req.params.groupId);
    const group = await storage.getAnnouncementGroup(groupId);
    if (!group || group.venueId !== venue.id) {
      return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Announcement group not found" });
    }

    await storage.deleteAnnouncementGroup(groupId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete announcement group error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Add announcement to a group
router.post("/api/me/venues/:venueId/announcement-groups/:groupId/announcements", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const groupId = parseInt(req.params.groupId);
    const group = await storage.getAnnouncementGroup(groupId);
    if (!group || group.venueId !== venue.id) {
      return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Announcement group not found" });
    }

    const { name, audioUrl, duration } = req.body;
    if (!name || !audioUrl) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Name and audio URL are required" });
    }

    const existingAnnouncements = await storage.getAnnouncementsByGroup(groupId);
    
    const announcement = await storage.createAnnouncement({
      venueId: venue.id,
      groupId: groupId,
      name,
      audioUrl,
      duration: duration || null,
      isActive: true,
      position: existingAnnouncements.length,
    });

    res.json({ success: true, announcement });
  } catch (error) {
    console.error("Add announcement to group error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// ==================== Announcements (Legacy) ====================

// Get all announcements for a venue
router.get("/api/me/venues/:venueId/announcements", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const announcements = await storage.getAnnouncementsByVenue(venue.id);
    res.json({ announcements });
  } catch (error) {
    console.error("Get announcements error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Create a new announcement
router.post("/api/me/venues/:venueId/announcements", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const { name, audioUrl, duration } = req.body;
    if (!name || !audioUrl) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Name and audio URL are required" });
    }

    const count = await storage.getAnnouncementCount(venue.id);
    
    const announcement = await storage.createAnnouncement({
      venueId: venue.id,
      name,
      audioUrl,
      duration: duration || null,
      isActive: true,
      position: count,
    });

    res.json({ success: true, announcement });
  } catch (error) {
    console.error("Create announcement error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Update an announcement
router.patch("/api/me/venues/:venueId/announcements/:announcementId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const announcementId = parseInt(req.params.announcementId);
    const announcement = await storage.getAnnouncement(announcementId);
    if (!announcement || announcement.venueId !== venue.id) {
      return res.status(404).json({ error: "ANNOUNCEMENT_NOT_FOUND", message: "Announcement not found" });
    }

    const { name, isActive } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await storage.updateAnnouncement(announcementId, updateData);
    res.json({ success: true, announcement: updated });
  } catch (error) {
    console.error("Update announcement error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Delete an announcement
router.delete("/api/me/venues/:venueId/announcements/:announcementId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const announcementId = parseInt(req.params.announcementId);
    const announcement = await storage.getAnnouncement(announcementId);
    if (!announcement || announcement.venueId !== venue.id) {
      return res.status(404).json({ error: "ANNOUNCEMENT_NOT_FOUND", message: "Announcement not found" });
    }

    await storage.deleteAnnouncement(announcementId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete announcement error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Update venue announcement settings
router.patch("/api/me/venues/:venueId/announcement-settings", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email || "";
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { org } = await getUserOrganization(userId, userEmail);
    if (!org) {
      return res.status(403).json({ error: "FORBIDDEN", message: "No organization found" });
    }

    const venueId = parseInt(req.params.venueId);
    const venue = await storage.getVenue(venueId);
    if (!venue || venue.organizationId !== org.id) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const { frequencyType, frequency, playMode } = req.body;
    const updateData: any = {};
    
    // frequencyType: null (disabled), 'songs', or 'minutes'
    if (frequencyType !== undefined) updateData.announcementFrequencyType = frequencyType;
    if (frequency !== undefined) updateData.announcementFrequency = frequency;
    if (playMode !== undefined) updateData.announcementPlayMode = playMode;

    const updated = await storage.updateVenue(venueId, updateData);
    res.json({ success: true, venue: updated });
  } catch (error) {
    console.error("Update announcement settings error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Get next announcement to play (used by kiosk) - now works with groups
router.get("/api/v1/venues/:code/next-announcement", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    if (venue.urgentAnnouncementTriggeredAt && (venue.urgentAnnouncementText || venue.urgentAnnouncementAudioUrl)) {
      return res.json({
        shouldPlay: true,
        urgent: true,
        groupId: null,
        announcement: {
          id: -1,
          name: "Urgent Announcement",
          audioUrl: venue.urgentAnnouncementAudioUrl || null,
          ttsText: venue.urgentAnnouncementText || null,
          duration: null,
        },
      });
    }

    // Get all announcement groups for this venue
    const groups = await storage.getAnnouncementGroupsByVenue(venue.id);
    if (groups.length === 0) {
      return res.json({ shouldPlay: false, announcement: null, groupId: null });
    }

    // Check each group to see if any should play
    for (const group of groups) {
      const activeAnnouncements = await storage.getActiveAnnouncementsByGroup(group.id);
      if (activeAnnouncements.length === 0) continue;

      let shouldPlay = false;

      if (group.frequencyType === 'songs') {
        const songsSince = group.songsSincePlay || 0;
        const frequency = group.frequency || 5;
        shouldPlay = songsSince >= frequency;
      } else if (group.frequencyType === 'minutes') {
        const lastPlayed = group.lastPlayedAt;
        const frequency = group.frequency || 30;
        if (!lastPlayed) {
          shouldPlay = true;
        } else {
          const minutesSince = (Date.now() - new Date(lastPlayed).getTime()) / 60000;
          shouldPlay = minutesSince >= frequency;
        }
      } else if (group.frequencyType === 'hourly') {
        const now = new Date();
        const lastPlayed = group.lastPlayedAt;
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        if (currentMinute < 5) {
          if (!lastPlayed) {
            shouldPlay = true;
          } else {
            const lastPlayedDate = new Date(lastPlayed);
            const lastPlayedHour = lastPlayedDate.getHours();
            const lastPlayedDay = lastPlayedDate.toDateString();
            const today = now.toDateString();
            shouldPlay = lastPlayedDay !== today || lastPlayedHour !== currentHour;
          }
        }
      }

      if (shouldPlay) {
        let announcement;
        if (group.playMode === 'random') {
          const randomIndex = Math.floor(Math.random() * activeAnnouncements.length);
          announcement = activeAnnouncements[randomIndex];
        } else {
          // Sequential - use lastPlayedIndex to track position
          const lastIndex = group.lastPlayedIndex ?? -1;
          const nextIndex = (lastIndex + 1) % activeAnnouncements.length;
          announcement = activeAnnouncements[nextIndex];
        }

        return res.json({ 
          shouldPlay: true, 
          groupId: group.id,
          announcement: {
            id: announcement.id,
            name: announcement.name,
            audioUrl: announcement.audioUrl,
            duration: announcement.duration,
          }
        });
      }
    }

    return res.json({ shouldPlay: false, announcement: null, groupId: null });
  } catch (error) {
    console.error("Get next announcement error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Mark announcement as played (update group counters)
router.post("/api/v1/venues/:code/announcement-played", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const { groupId, announcementId, urgent, deviceId } = req.body;

    if (urgent) {
      if (!deviceId || venue.kioskLockId !== deviceId) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Only the active kiosk device can clear urgent announcements" });
      }
      await storage.updateVenue(venue.id, {
        urgentAnnouncementText: null,
        urgentAnnouncementAudioUrl: null,
        urgentAnnouncementTriggeredAt: null,
      });
      return res.json({ success: true });
    }
    
    if (groupId) {
      const group = await storage.getAnnouncementGroup(groupId);
      if (group && group.venueId === venue.id) {
        const announcements = await storage.getActiveAnnouncementsByGroup(groupId);
        const announcementIndex = announcements.findIndex(a => a.id === announcementId);
        
        await storage.updateAnnouncementGroup(groupId, {
          songsSincePlay: 0,
          lastPlayedAt: new Date(),
          lastPlayedIndex: announcementIndex >= 0 ? announcementIndex : group.lastPlayedIndex,
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Announcement played error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Increment song counter for all announcement groups
router.post("/api/v1/venues/:code/song-finished", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    // Increment song count for all announcement groups
    const groups = await storage.getAnnouncementGroupsByVenue(venue.id);
    for (const group of groups) {
      const currentCount = group.songsSincePlay || 0;
      await storage.updateAnnouncementGroup(group.id, {
        songsSincePlay: currentCount + 1,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Song finished error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Get play history for a venue
router.get("/api/me/venues/:id/history", isAuthenticated, async (req: any, res: Response) => {
  try {
    const venueId = parseInt(req.params.id);
    const venue = await storage.getVenue(venueId);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const history = await storage.getPlayHistory(venueId, 100);
    res.json({ history });
  } catch (error) {
    console.error("Get play history error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Get banned songs for a venue
router.get("/api/me/venues/:id/banned", isAuthenticated, async (req: any, res: Response) => {
  try {
    const venueId = parseInt(req.params.id);
    const venue = await storage.getVenue(venueId);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const bannedSongs = await storage.getBannedSongs(venueId);
    res.json({ bannedSongs });
  } catch (error) {
    console.error("Get banned songs error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Ban a song
router.post("/api/me/venues/:id/ban", isAuthenticated, async (req: any, res: Response) => {
  try {
    const venueId = parseInt(req.params.id);
    const { trackId, title, artist, albumCover } = req.body;

    if (!trackId || !title || !artist) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "trackId, title, and artist are required" });
    }

    const venue = await storage.getVenue(venueId);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    // Check if already banned
    const alreadyBanned = await storage.isSongBanned(venueId, trackId);
    if (alreadyBanned) {
      return res.status(400).json({ error: "ALREADY_BANNED", message: "Song is already banned" });
    }

    const banned = await storage.banSong(venueId, trackId, title, artist, albumCover);
    res.json({ success: true, banned });
  } catch (error) {
    console.error("Ban song error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// Unban a song
router.delete("/api/me/venues/:id/ban/:trackId", isAuthenticated, async (req: any, res: Response) => {
  try {
    const venueId = parseInt(req.params.id);
    const trackId = req.params.trackId;

    const venue = await storage.getVenue(venueId);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    await storage.unbanSong(venueId, trackId);
    res.json({ success: true });
  } catch (error) {
    console.error("Unban song error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

// ============ SONOS INTEGRATION ============

const SONOS_AUTH_URL = "https://api.sonos.com/login/v3/oauth";
const SONOS_TOKEN_URL = "https://api.sonos.com/login/v3/oauth/access";
const SONOS_API_URL = "https://api.ws.sonos.com/control/api/v1";

import crypto from "crypto";

function getOAuthStateSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.SONOS_CLIENT_SECRET;
  if (!secret) {
    throw new Error("OAuth state secret not configured: set SESSION_SECRET or SONOS_CLIENT_SECRET");
  }
  return secret;
}

function signOAuthState(data: { venueCode: string; userId: string; timestamp: number }): string {
  const payload = JSON.stringify(data);
  const hmac = crypto.createHmac("sha256", getOAuthStateSecret());
  hmac.update(payload);
  const signature = hmac.digest("hex");
  return Buffer.from(JSON.stringify({ payload, signature })).toString("base64url");
}

function verifyOAuthState(state: string): { venueCode: string; userId: string; timestamp: number } | null {
  try {
    const { payload, signature } = JSON.parse(Buffer.from(state, "base64url").toString());
    const hmac = crypto.createHmac("sha256", getOAuthStateSecret());
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }
    
    const data = JSON.parse(payload);
    if (Date.now() - data.timestamp > 10 * 60 * 1000) {
      return null;
    }
    
    return data;
  } catch {
    return null;
  }
}

// Start Sonos OAuth flow for a venue
router.get("/api/sonos/connect/:venueCode", isAuthenticated, async (req: any, res) => {
  try {
    const { venueCode } = req.params;
    const userId = req.user?.claims?.sub;
    
    // Verify user has access to this venue
    const venue = await storage.getVenueByCode(venueCode);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND" });
    }
    
    const org = await storage.getOrganization(venue.organizationId);
    if (!org) {
      return res.status(404).json({ error: "ORG_NOT_FOUND" });
    }
    
    // Check if user is owner or team member
    const isOwner = org.ownerId === userId;
    const memberOrgs = await storage.getOrganizationsByMemberAuthId(userId);
    const isMember = memberOrgs.some(o => o.id === org.id);
    if (!isOwner && !isMember) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const clientId = process.env.SONOS_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "SONOS_NOT_CONFIGURED" });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/sonos/callback`;
    const state = signOAuthState({ venueCode, userId, timestamp: Date.now() });

    const authUrl = `${SONOS_AUTH_URL}?` + new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      state: state,
      scope: "playback-control-all",
      redirect_uri: redirectUri,
    }).toString();

    res.redirect(authUrl);
  } catch (error) {
    console.error("Sonos connect error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Sonos OAuth callback
router.get("/api/sonos/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error("Sonos OAuth error:", error);
      return res.redirect("/admin?sonos_error=auth_denied");
    }

    if (!code || !state) {
      return res.redirect("/admin?sonos_error=missing_params");
    }

    const stateData = verifyOAuthState(state as string);
    if (!stateData) {
      return res.redirect("/admin?sonos_error=invalid_state");
    }

    const { venueCode, userId } = stateData;
    const venue = await storage.getVenueByCode(venueCode);
    if (!venue) {
      return res.redirect("/admin?sonos_error=venue_not_found");
    }

    const org = await storage.getOrganization(venue.organizationId);
    if (!org) {
      return res.redirect("/admin?sonos_error=org_not_found");
    }
    
    const isOwner = org.ownerId === userId;
    const memberOrgs = await storage.getOrganizationsByMemberAuthId(userId);
    const isMember = memberOrgs.some(o => o.id === org.id);
    if (!isOwner && !isMember) {
      return res.redirect("/admin?sonos_error=forbidden");
    }

    // Exchange code for tokens
    const clientId = process.env.SONOS_CLIENT_ID;
    const clientSecret = process.env.SONOS_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/sonos/callback`;

    const tokenResponse = await fetch(SONOS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Sonos token exchange failed:", errorText);
      return res.redirect("/admin?sonos_error=token_exchange_failed");
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Get households to find available groups
    const householdsResponse = await fetch(`${SONOS_API_URL}/households`, {
      headers: { "Authorization": `Bearer ${tokens.access_token}` },
    });

    if (!householdsResponse.ok) {
      return res.redirect("/admin?sonos_error=households_failed");
    }

    const householdsData = await householdsResponse.json() as { households: { id: string }[] };
    const householdId = householdsData.households?.[0]?.id;

    if (!householdId) {
      return res.redirect("/admin?sonos_error=no_households");
    }

    // Get groups in the household
    const groupsResponse = await fetch(`${SONOS_API_URL}/households/${householdId}/groups`, {
      headers: { "Authorization": `Bearer ${tokens.access_token}` },
    });

    if (!groupsResponse.ok) {
      return res.redirect("/admin?sonos_error=groups_failed");
    }

    const groupsData = await groupsResponse.json() as { groups: { id: string; name: string }[] };
    const firstGroup = groupsData.groups?.[0];

    // Save tokens to venue
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await storage.updateVenue(venue.id, {
      sonosEnabled: true,
      sonosAccessToken: tokens.access_token,
      sonosRefreshToken: tokens.refresh_token,
      sonosTokenExpiresAt: expiresAt,
      sonosHouseholdId: householdId,
      sonosGroupId: firstGroup?.id || null,
      sonosGroupName: firstGroup?.name || null,
    });

    res.redirect(`/admin?sonos_connected=true&venue=${venueCode}`);
  } catch (error) {
    console.error("Sonos callback error:", error);
    res.redirect("/admin?sonos_error=callback_failed");
  }
});

// Get Sonos status for a venue
router.get("/api/venues/:code/sonos", isAuthenticated, async (req: any, res) => {
  try {
    const { code } = req.params;
    const venue = await storage.getVenueByCode(code);
    
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND" });
    }

    // Refresh token if needed
    if (venue.sonosEnabled && venue.sonosTokenExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(venue.sonosTokenExpiresAt);
      
      // Refresh if expires in less than 5 minutes
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000 && venue.sonosRefreshToken) {
        try {
          const refreshed = await refreshSonosToken(venue);
          if (refreshed) {
            venue.sonosAccessToken = refreshed.accessToken;
            venue.sonosTokenExpiresAt = refreshed.expiresAt;
          }
        } catch (err) {
          console.error("Failed to refresh Sonos token:", err);
        }
      }
    }

    // Get current groups if connected
    let groups: { id: string; name: string }[] = [];
    if (venue.sonosEnabled && venue.sonosAccessToken && venue.sonosHouseholdId) {
      try {
        const groupsResponse = await fetch(`${SONOS_API_URL}/households/${venue.sonosHouseholdId}/groups`, {
          headers: { "Authorization": `Bearer ${venue.sonosAccessToken}` },
        });
        if (groupsResponse.ok) {
          const data = await groupsResponse.json() as { groups: { id: string; name: string }[] };
          groups = data.groups || [];
        }
      } catch (err) {
        console.error("Failed to fetch Sonos groups:", err);
      }
    }

    res.json({
      enabled: venue.sonosEnabled,
      connected: !!(venue.sonosAccessToken && venue.sonosHouseholdId),
      householdId: venue.sonosHouseholdId,
      groupId: venue.sonosGroupId,
      groupName: venue.sonosGroupName,
      groups,
    });
  } catch (error) {
    console.error("Sonos status error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Update Sonos settings for a venue
router.patch("/api/venues/:code/sonos", isAuthenticated, async (req: any, res) => {
  try {
    const { code } = req.params;
    const { groupId, enabled } = req.body;
    const userId = req.user?.claims?.sub;
    
    const venue = await storage.getVenueByCode(code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND" });
    }

    const org = await storage.getOrganization(venue.organizationId);
    if (!org) {
      return res.status(404).json({ error: "ORG_NOT_FOUND" });
    }

    const isOwner = org.ownerId === userId;
    const memberOrgs = await storage.getOrganizationsByMemberAuthId(userId);
    const isMember = memberOrgs.some(o => o.id === org.id);
    if (!isOwner && !isMember) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const updates: any = {};
    
    if (typeof enabled === "boolean") {
      updates.sonosEnabled = enabled;
    }
    
    if (groupId !== undefined) {
      updates.sonosGroupId = groupId;
      
      // Get group name
      if (groupId && venue.sonosAccessToken && venue.sonosHouseholdId) {
        try {
          const groupsResponse = await fetch(`${SONOS_API_URL}/households/${venue.sonosHouseholdId}/groups`, {
            headers: { "Authorization": `Bearer ${venue.sonosAccessToken}` },
          });
          if (groupsResponse.ok) {
            const data = await groupsResponse.json() as { groups: { id: string; name: string }[] };
            const group = data.groups?.find((g: any) => g.id === groupId);
            updates.sonosGroupName = group?.name || null;
          }
        } catch (err) {
          console.error("Failed to fetch group name:", err);
        }
      }
    }

    await storage.updateVenue(venue.id, updates);
    res.json({ success: true });
  } catch (error) {
    console.error("Sonos update error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Disconnect Sonos from a venue
router.delete("/api/venues/:code/sonos", isAuthenticated, async (req: any, res) => {
  try {
    const { code } = req.params;
    const userId = req.user?.claims?.sub;
    
    const venue = await storage.getVenueByCode(code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND" });
    }

    const org = await storage.getOrganization(venue.organizationId);
    if (!org) {
      return res.status(404).json({ error: "ORG_NOT_FOUND" });
    }

    const isOwner = org.ownerId === userId;
    const memberOrgs = await storage.getOrganizationsByMemberAuthId(userId);
    const isMember = memberOrgs.some(o => o.id === org.id);
    if (!isOwner && !isMember) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    await storage.updateVenue(venue.id, {
      sonosEnabled: false,
      sonosAccessToken: null,
      sonosRefreshToken: null,
      sonosTokenExpiresAt: null,
      sonosHouseholdId: null,
      sonosGroupId: null,
      sonosGroupName: null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Sonos disconnect error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Play a track on Sonos using Apple Music (requires Apple Music linked to Sonos)
router.post("/api/venues/:code/sonos/play", isAuthenticated, async (req: any, res) => {
  try {
    const { code } = req.params;
    const { trackName, trackId, artist, album } = req.body;
    
    if (!trackId) {
      return res.status(400).json({ error: "TRACK_ID_REQUIRED", message: "Apple Music track ID is required for Sonos playback" });
    }
    
    const venue = await storage.getVenueByCode(code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND" });
    }

    if (!venue.sonosEnabled || !venue.sonosAccessToken || !venue.sonosGroupId) {
      return res.status(400).json({ error: "SONOS_NOT_CONFIGURED" });
    }

    // Refresh token if needed
    let accessToken = venue.sonosAccessToken;
    if (venue.sonosTokenExpiresAt && new Date(venue.sonosTokenExpiresAt) < new Date()) {
      const refreshed = await refreshSonosToken(venue);
      if (refreshed) {
        accessToken = refreshed.accessToken;
      }
    }

    // Play using Apple Music's musicObjectId format
    // Apple Music service ID on Sonos is 204
    // Format: x-sonos-http:song:{trackId}.mp4?sid=204&flags=8224&sn=1
    const appleMusicObjectId = `x-sonos-http:song:${trackId}.mp4?sid=204&flags=8224&sn=1`;
    
    const playResponse = await fetch(`${SONOS_API_URL}/groups/${venue.sonosGroupId}/playback`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId: "com.jukboks.app",
        appContext: trackId,
      }),
    });

    if (playResponse.ok) {
      return res.json({ success: true });
    }
    
    const errorText = await playResponse.text();
    console.error("Sonos Apple Music playback failed:", errorText);
    return res.status(400).json({ 
      error: "APPLE_MUSIC_PLAYBACK_FAILED", 
      message: "Failed to play on Sonos. Make sure Apple Music is linked to your Sonos system.",
      details: errorText 
    });
  } catch (error) {
    console.error("Sonos play error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Sonos playback control (pause, skip, etc.)
router.post("/api/venues/:code/sonos/control", isAuthenticated, async (req: any, res) => {
  try {
    const { code } = req.params;
    const { action } = req.body; // play, pause, skipToNextTrack
    
    const venue = await storage.getVenueByCode(code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND" });
    }

    if (!venue.sonosEnabled || !venue.sonosAccessToken || !venue.sonosGroupId) {
      return res.status(400).json({ error: "SONOS_NOT_CONFIGURED" });
    }

    const controlResponse = await fetch(`${SONOS_API_URL}/groups/${venue.sonosGroupId}/playback/${action}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${venue.sonosAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!controlResponse.ok) {
      const errorText = await controlResponse.text();
      console.error(`Sonos ${action} failed:`, errorText);
      return res.status(400).json({ error: "CONTROL_FAILED", details: errorText });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Sonos control error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Sonos event webhook
router.post("/api/sonos/events", async (req, res) => {
  // Handle Sonos webhook events (playback state changes, etc.)
  res.status(200).send("OK");
});

// Helper function to refresh Sonos token
async function refreshSonosToken(venue: any): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const clientId = process.env.SONOS_CLIENT_ID;
  const clientSecret = process.env.SONOS_CLIENT_SECRET;

  if (!clientId || !clientSecret || !venue.sonosRefreshToken) {
    return null;
  }

  const tokenResponse = await fetch(SONOS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: venue.sonosRefreshToken,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error("Failed to refresh Sonos token");
  }

  const tokens = await tokenResponse.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await storage.updateVenue(venue.id, {
    sonosAccessToken: tokens.access_token,
    sonosRefreshToken: tokens.refresh_token || venue.sonosRefreshToken,
    sonosTokenExpiresAt: expiresAt,
  });

  return { accessToken: tokens.access_token, expiresAt };
}

// Super Admin Routes
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

function isSuperAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

router.get("/api/super-admin/check", isAuthenticated, async (req: any, res) => {
  const userEmail = req.user?.claims?.email;
  res.json({ isSuperAdmin: isSuperAdmin(userEmail) });
});

router.get("/api/super-admin/organizations", isAuthenticated, async (req: any, res) => {
  try {
    const userEmail = req.user?.claims?.email;
    if (!isSuperAdmin(userEmail)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin access required" });
    }

    const orgs = await storage.getAllOrganizations();
    res.json({ organizations: orgs });
  } catch (error) {
    console.error("Super admin get orgs error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Super admin: Delete any organization
router.delete("/api/super-admin/organizations/:orgId", isAuthenticated, async (req: any, res) => {
  try {
    const userEmail = req.user?.claims?.email;
    if (!isSuperAdmin(userEmail)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin access required" });
    }

    const orgId = parseInt(req.params.orgId);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "INVALID_ID", message: "Invalid organization ID" });
    }

    const org = await storage.getOrganization(orgId);
    if (!org) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Organization not found" });
    }

    await storage.deleteOrganization(orgId);
    console.log(`Super admin ${userEmail} deleted organization ${org.name} (ID: ${orgId})`);
    
    res.json({ success: true, message: "Organization deleted" });
  } catch (error) {
    console.error("Super admin delete organization error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.get("/api/super-admin/venues", isAuthenticated, async (req: any, res) => {
  try {
    const userEmail = req.user?.claims?.email;
    if (!isSuperAdmin(userEmail)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin access required" });
    }

    const venues = await storage.getAllVenues();
    const guestCounts = await storage.getGuestCountsByVenue();
    
    const venuesWithCounts = venues.map(venue => ({
      ...venue,
      guestCount: guestCounts.get(venue.id) || 0,
    }));
    
    res.json({ venues: venuesWithCounts });
  } catch (error) {
    console.error("Super admin get venues error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Super admin: Get guests for a venue
router.get("/api/super-admin/venues/:venueId/guests", isAuthenticated, async (req: any, res) => {
  try {
    const userEmail = req.user?.claims?.email;
    if (!isSuperAdmin(userEmail)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin access required" });
    }

    const venueId = parseInt(req.params.venueId);
    if (isNaN(venueId)) {
      return res.status(400).json({ error: "INVALID_ID", message: "Invalid venue ID" });
    }

    const guests = await storage.getGuestsByVenue(venueId);
    res.json({ guests });
  } catch (error) {
    console.error("Super admin get venue guests error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Super admin: Delete any venue
router.delete("/api/super-admin/venues/:venueId", isAuthenticated, async (req: any, res) => {
  try {
    const userEmail = req.user?.claims?.email;
    if (!isSuperAdmin(userEmail)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin access required" });
    }

    const venueId = parseInt(req.params.venueId);
    if (isNaN(venueId)) {
      return res.status(400).json({ error: "INVALID_ID", message: "Invalid venue ID" });
    }

    const venue = await storage.getVenue(venueId);
    if (!venue) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Venue not found" });
    }

    await storage.deleteVenue(venueId);
    console.log(`Super admin ${userEmail} deleted venue ${venue.name} (ID: ${venueId})`);
    
    res.json({ success: true, message: "Venue deleted" });
  } catch (error) {
    console.error("Super admin delete venue error:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.get("/api/me/api-key", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const org = await storage.getOrganizationByOwnerId(userId);
    if (!org) {
      return res.status(404).json({ error: "NOT_FOUND", message: "No organization found" });
    }

    if (!org.apiKey) {
      res.json({ apiKey: null, maskedKey: null });
    } else {
      const masked = org.apiKey.slice(0, 8) + "•".repeat(org.apiKey.length - 8);
      res.json({ apiKey: null, maskedKey: masked });
    }
  } catch (error) {
    console.error("Get API key error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/me/api-key", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const org = await storage.getOrganizationByOwnerId(userId);
    if (!org) {
      return res.status(404).json({ error: "NOT_FOUND", message: "No organization found" });
    }

    const newKey = nanoid(32);
    await storage.updateOrganization(org.id, { apiKey: newKey, apiKeyCreatedAt: new Date() });

    res.json({ apiKey: newKey });
  } catch (error) {
    console.error("Generate API key error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.get("/api/me/venues/:id/analytics", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const venueId = parseInt(req.params.id);
    const venue = await storage.getVenue(venueId);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = await storage.getOrganization(venue.organizationId);
    if (!org || org.ownerId !== userId) {
      const members = await storage.getOrganizationMembers(org?.id || 0);
      const isMember = members.some((m: any) => m.authUserId === userId);
      if (!isMember) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Not authorized" });
      }
    }

    const parsedDays = parseInt(req.query.days as string);
    const days = Number.isFinite(parsedDays) && parsedDays >= 1 ? Math.min(parsedDays, 365) : 30;
    const analytics = await storage.getVenueAnalytics(venueId, days);
    res.json(analytics);
  } catch (error) {
    console.error("Get venue analytics error:", error);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

export default router;
