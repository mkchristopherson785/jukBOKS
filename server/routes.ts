import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { storage } from "./storage";
import type { InsertRequest, InsertVote } from "../shared/schema";

const router = Router();

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

router.get("/api/v1/venues/:code", async (req: Request, res: Response) => {
  try {
    const venue = await storage.getVenueByCode(req.params.code);
    if (!venue) {
      return res.status(404).json({ error: "VENUE_NOT_FOUND", message: "Venue not found" });
    }
    
    const org = await storage.getOrganization(venue.organizationId);
    
    res.json({
      code: venue.code,
      name: venue.name,
      organizationName: org?.name || "",
      logoUrl: org?.logoUrl,
      logoDarkUrl: org?.logoDarkUrl,
      primaryColor: org?.primaryColor,
      allowExplicit: venue.allowExplicit,
      dailyRequestLimit: venue.dailyRequestLimit,
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
        requesterName: item.requesterName,
        isAutoPlay: item.isAutoPlay,
        voteCount: item.voteCount,
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

    const { trackId, title, artist, album, albumCover, duration, isExplicit, requesterName } = req.body;

    if (!trackId || !title || !artist) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "trackId, title, and artist are required" });
    }

    if (!venue.allowExplicit && isExplicit === true) {
      return res.status(400).json({ error: "EXPLICIT_NOT_ALLOWED", message: "This venue does not allow explicit content" });
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
      requesterName,
      status: venue.autoApprove ? "approved" : "pending",
    };

    if (guest) {
      const currentCount = guest.requestCount || 0;
      const limit = venue.dailyRequestLimit || 5;
      
      if (currentCount >= limit) {
        return res.status(400).json({ 
          error: "DAILY_LIMIT_REACHED", 
          message: `You have reached your daily request limit of ${limit} songs` 
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
    const { requestId } = req.body;

    if (!requestId || typeof requestId !== "number") {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "requestId is required" });
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

    let voteData: InsertVote = { requestId };

    if (guest) {
      const hasVoted = await storage.hasVoted(requestId, undefined, guest.id);
      if (hasVoted) {
        return res.status(400).json({ error: "ALREADY_VOTED", message: "You have already voted for this song" });
      }
      voteData.guestId = guest.id;
      await storage.updateGuest(guest.id, { lastActiveAt: new Date() });
    }

    await storage.createVote(voteData);
    const votes = await storage.getVotesByRequest(requestId);

    res.json({
      success: true,
      voteCount: votes.length,
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
        voteCount: item.voteCount,
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
      requestsRemaining: venue?.dailyRequestLimit || 5,
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

    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:5000";
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

export default router;
