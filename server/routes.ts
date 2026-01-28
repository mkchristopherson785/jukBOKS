import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { SignJWT, importPKCS8 } from "jose";
import { storage } from "./storage";
import type { InsertRequest, InsertVote } from "../shared/schema";
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
    
    console.log("Formatted key starts with:", formattedKey.substring(0, 30));
    console.log("Formatted key ends with:", formattedKey.substring(formattedKey.length - 30));
    
    // Import the PKCS8 private key
    const key = await importPKCS8(formattedKey, 'ES256');
    
    // Create the JWT
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .setExpirationTime('180d')
      .sign(key);
    
    console.log("Apple Music token generated successfully");
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
    console.log("No Apple Music token available");
    return null;
  }

  try {
    // Include tracks relationship to get accurate track count
    const response = await fetch(
      `https://api.music.apple.com/v1/catalog/us/playlists/${playlistId}?include=tracks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.log("Apple playlist fetch failed:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const playlist = data.data?.[0];
    if (!playlist) {
      console.log("No playlist data returned");
      return null;
    }

    // Try to get track count from tracks relationship or attributes
    const tracksData = playlist.relationships?.tracks?.data;
    const trackCount = tracksData?.length || playlist.attributes?.trackCount || 0;

    console.log("Playlist details:", {
      name: playlist.attributes?.name,
      trackCount,
      hasTracksRelation: !!tracksData,
      attrTrackCount: playlist.attributes?.trackCount
    });

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
      autoApprove: venue.autoApprove,
      dailyRequestLimit: venue.dailyRequestLimit,
      isActive: venue.isActive,
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

    const wasPlayedRecently = await storage.wasTrackPlayedRecently(venue.id, trackId, 2);
    if (wasPlayedRecently) {
      return res.status(400).json({ 
        error: "SONG_PLAYED_RECENTLY", 
        message: "This song was played in the last 2 hours. Please choose a different song." 
      });
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
    const session = await storage.getPartySessionByCode(req.params.partyCode);
    if (!session || !session.isActive) {
      return res.status(404).json({ error: "PARTY_NOT_ACTIVE", message: "Party session not active" });
    }

    const venue = await storage.getVenue(session.venueId);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }

    const org = await storage.getOrganization(venue.organizationId);
    const queue = await storage.getQueueWithVotes(venue.id);

    res.json({
      venue: {
        code: venue.code,
        name: venue.name,
        allowExplicit: venue.allowExplicit,
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
        upvotes: item.upvotes,
        downvotes: item.downvotes,
        netVotes: item.netVotes,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal server error" });
  }
});

router.post("/api/v1/party/:partyCode/join", async (req: Request, res: Response) => {
  try {
    const session = await storage.getPartySessionByCode(req.params.partyCode);
    if (!session || !session.isActive) {
      return res.status(404).json({ error: "PARTY_NOT_ACTIVE", message: "Party session not active" });
    }

    const venue = await storage.getVenue(session.venueId);
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

    // Use deployment domain in production, dev domain in development
    let baseUrl: string;
    if (process.env.NODE_ENV === "production" && process.env.REPLIT_DEPLOYMENT_URL) {
      baseUrl = process.env.REPLIT_DEPLOYMENT_URL;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else {
      baseUrl = "http://localhost:5000";
    }
    const partyUrl = `${baseUrl}/party/${session.code}`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(partyUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
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

    const { allowExplicit, dailyRequestLimit, autoApprove, autoPlayEnabled } = req.body;
    
    const updates: Partial<typeof venue> = {};
    if (typeof allowExplicit === "boolean") updates.allowExplicit = allowExplicit;
    if (typeof autoApprove === "boolean") updates.autoApprove = autoApprove;
    if (typeof autoPlayEnabled === "boolean") updates.autoPlayEnabled = autoPlayEnabled;
    if (typeof dailyRequestLimit === "number" && dailyRequestLimit >= 0 && dailyRequestLimit <= 100) {
      updates.dailyRequestLimit = dailyRequestLimit;
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

// Get a random song from a random backup playlist for auto-play
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

    // Pick a random playlist
    const randomPlaylist = playlists[Math.floor(Math.random() * playlists.length)];
    
    const token = await getAppleMusicToken();
    if (!token) {
      return res.status(500).json({ error: "TOKEN_ERROR", message: "Could not get Apple Music token" });
    }

    // Fetch tracks from the playlist
    const response = await fetch(
      `https://api.music.apple.com/v1/catalog/us/playlists/${randomPlaylist.applePlaylistId}?include=tracks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(500).json({ error: "APPLE_ERROR", message: "Could not fetch playlist tracks" });
    }

    const data = await response.json();
    const tracks = data.data?.[0]?.relationships?.tracks?.data || [];
    
    if (tracks.length === 0) {
      return res.status(404).json({ error: "NO_TRACKS", message: "Playlist has no tracks" });
    }

    // Pick a random track
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    const attrs = randomTrack.attributes;

    // Create a request for the random song
    const request = await storage.createRequest({
      venueId: venue.id,
      trackId: randomTrack.id,
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

    res.json({ success: true, request, source: "backup_playlist", playlistName: randomPlaylist.name });
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

    const { name, allowExplicit, autoApprove, dailyRequestLimit, isActive } = req.body;
    
    const updatedVenue = await storage.updateVenue(venueId, {
      ...(name !== undefined && { name }),
      ...(allowExplicit !== undefined && { allowExplicit }),
      ...(autoApprove !== undefined && { autoApprove }),
      ...(dailyRequestLimit !== undefined && { dailyRequestLimit }),
      ...(isActive !== undefined && { isActive }),
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

    const { playlistUrl } = req.body;
    if (!playlistUrl) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "playlistUrl is required" });
    }

    // Extract playlist ID from Apple Music URL
    const urlMatch = playlistUrl.match(/playlist\/[^\/]+\/pl\.([a-zA-Z0-9-]+)/);
    if (!urlMatch) {
      return res.status(400).json({ error: "INVALID_URL", message: "Invalid Apple Music playlist URL" });
    }
    const applePlaylistId = `pl.${urlMatch[1]}`;

    // Fetch playlist details from Apple Music
    const playlistDetails = await fetchApplePlaylistDetails(applePlaylistId);

    const playlist = await storage.createBackupPlaylist({
      venueId: venue.id,
      name: playlistDetails?.name || "Apple Music Playlist",
      applePlaylistId,
      trackCount: playlistDetails?.trackCount || 0,
      artworkUrl: playlistDetails?.artworkUrl || null,
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

export default router;
