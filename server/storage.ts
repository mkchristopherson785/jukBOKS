import { eq, and, desc, sql, gte, asc, or } from "drizzle-orm";
import { db } from "./db";
import {
  organizations, users, venues, requests, votes, partySessions, guests, backupPlaylists, organizationMembers, announcements,
  type Organization, type InsertOrganization,
  type User, type InsertUser,
  type Venue, type InsertVenue,
  type Request, type InsertRequest,
  type Vote, type InsertVote,
  type PartySession, type InsertPartySession,
  type Guest, type InsertGuest,
  type BackupPlaylist, type InsertBackupPlaylist,
  type OrganizationMember, type InsertOrganizationMember,
  type Announcement, type InsertAnnouncement,
} from "../shared/schema";

export interface QueueItemWithVotes extends Request {
  upvotes: number;
  downvotes: number;
  netVotes: number;
}

export interface IStorage {
  createOrganization(data: InsertOrganization): Promise<Organization>;
  getOrganization(id: number): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  getOrganizationByApiKey(apiKey: string): Promise<Organization | undefined>;
  getOrganizationByOwnerId(ownerId: string): Promise<Organization | undefined>;
  
  createUser(data: InsertUser): Promise<User>;
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  
  createVenue(data: InsertVenue): Promise<Venue>;
  getVenue(id: number): Promise<Venue | undefined>;
  getVenueByCode(code: string): Promise<Venue | undefined>;
  getVenuesByOrganization(organizationId: number): Promise<Venue[]>;
  updateVenue(id: number, data: Partial<Venue>): Promise<Venue | undefined>;
  
  createRequest(data: InsertRequest): Promise<Request>;
  getRequest(id: number): Promise<Request | undefined>;
  getRequestsByVenue(venueId: number, status?: string): Promise<Request[]>;
  getQueueWithVotes(venueId: number): Promise<QueueItemWithVotes[]>;
  updateRequest(id: number, data: Partial<Request>): Promise<Request | undefined>;
  wasTrackPlayedRecently(venueId: number, trackId: string, hoursAgo: number): Promise<boolean>;
  
  createVote(data: InsertVote): Promise<Vote>;
  getVotesByRequest(requestId: number): Promise<Vote[]>;
  hasVoted(requestId: number, userId?: number, guestId?: number): Promise<boolean>;
  getVoteType(requestId: number, userId?: number, guestId?: number): Promise<string | null>;
  updateVoteType(requestId: number, voteType: string, userId?: number, guestId?: number): Promise<boolean>;
  removeVote(requestId: number, userId?: number, guestId?: number): Promise<boolean>;
  
  createPartySession(data: InsertPartySession): Promise<PartySession>;
  getPartySessionById(id: number): Promise<PartySession | undefined>;
  getPartySessionByCode(code: string): Promise<PartySession | undefined>;
  getActivePartySession(venueId: number, date: string): Promise<PartySession | undefined>;
  
  createGuest(data: InsertGuest): Promise<Guest>;
  getGuestByToken(token: string): Promise<Guest | undefined>;
  updateGuest(id: number, data: Partial<Guest>): Promise<Guest | undefined>;
  
  createBackupPlaylist(data: InsertBackupPlaylist): Promise<BackupPlaylist>;
  getBackupPlaylistsByVenue(venueId: number): Promise<BackupPlaylist[]>;
  deleteBackupPlaylist(id: number): Promise<boolean>;
  getBackupPlaylistCount(venueId: number): Promise<number>;
  
  createOrganizationMember(data: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]>;
  getOrganizationMemberByEmail(organizationId: number, email: string): Promise<OrganizationMember | undefined>;
  getOrganizationsByMemberEmail(email: string): Promise<Organization[]>;
  getOrganizationsByMemberAuthId(authUserId: string): Promise<Organization[]>;
  updateOrganizationMember(id: number, data: Partial<OrganizationMember>): Promise<OrganizationMember | undefined>;
  deleteOrganizationMember(id: number): Promise<boolean>;
  
  createAnnouncement(data: InsertAnnouncement): Promise<Announcement>;
  getAnnouncementsByVenue(venueId: number): Promise<Announcement[]>;
  getActiveAnnouncementsByVenue(venueId: number): Promise<Announcement[]>;
  getAnnouncement(id: number): Promise<Announcement | undefined>;
  updateAnnouncement(id: number, data: Partial<Announcement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: number): Promise<boolean>;
  getAnnouncementCount(venueId: number): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async createOrganization(data: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(data).returning();
    return org;
  }

  async getOrganization(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return org;
  }

  async getOrganizationByOwnerId(ownerId: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.ownerId, ownerId));
    return org;
  }

  async getOrganizationByApiKey(apiKey: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.apiKey, apiKey));
    return org;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createVenue(data: InsertVenue): Promise<Venue> {
    const [venue] = await db.insert(venues).values(data).returning();
    return venue;
  }

  async getVenue(id: number): Promise<Venue | undefined> {
    const [venue] = await db.select().from(venues).where(eq(venues.id, id));
    return venue;
  }

  async getVenueByCode(code: string): Promise<Venue | undefined> {
    const [venue] = await db.select().from(venues).where(eq(venues.code, code));
    return venue;
  }

  async getVenuesByOrganization(organizationId: number): Promise<Venue[]> {
    return db.select().from(venues).where(eq(venues.organizationId, organizationId));
  }

  async updateVenue(id: number, data: Partial<Venue>): Promise<Venue | undefined> {
    const [venue] = await db.update(venues).set({ ...data, updatedAt: new Date() }).where(eq(venues.id, id)).returning();
    return venue;
  }

  async deleteVenue(id: number): Promise<void> {
    await db.delete(backupPlaylists).where(eq(backupPlaylists.venueId, id));
    await db.delete(votes).where(
      sql`request_id IN (SELECT id FROM requests WHERE venue_id = ${id})`
    );
    await db.delete(requests).where(eq(requests.venueId, id));
    await db.delete(guests).where(
      sql`party_session_id IN (SELECT id FROM party_sessions WHERE venue_id = ${id})`
    );
    await db.delete(partySessions).where(eq(partySessions.venueId, id));
    await db.delete(venues).where(eq(venues.id, id));
  }

  async createRequest(data: InsertRequest): Promise<Request> {
    const [request] = await db.insert(requests).values(data).returning();
    return request;
  }

  async getRequest(id: number): Promise<Request | undefined> {
    const [request] = await db.select().from(requests).where(eq(requests.id, id));
    return request;
  }

  async getRequestsByVenue(venueId: number, status?: string): Promise<Request[]> {
    if (status) {
      return db.select().from(requests).where(and(eq(requests.venueId, venueId), eq(requests.status, status)));
    }
    return db.select().from(requests).where(eq(requests.venueId, venueId));
  }

  async getQueueWithVotes(venueId: number): Promise<QueueItemWithVotes[]> {
    const result = await db
      .select({
        request: requests,
        upvotes: sql<number>`COALESCE(SUM(CASE WHEN ${votes.voteType} = 'up' THEN 1 ELSE 0 END), 0)::int`,
        downvotes: sql<number>`COALESCE(SUM(CASE WHEN ${votes.voteType} = 'down' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(requests)
      .leftJoin(votes, eq(requests.id, votes.requestId))
      .where(and(
        eq(requests.venueId, venueId),
        sql`${requests.status} IN ('pending', 'approved')`
      ))
      .groupBy(requests.id)
      .orderBy(
        desc(sql`COALESCE(SUM(CASE WHEN ${votes.voteType} = 'up' THEN 1 ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ${votes.voteType} = 'down' THEN 1 ELSE 0 END), 0)`),
        requests.requestedAt
      );

    return result.map(r => ({ 
      ...r.request, 
      upvotes: r.upvotes,
      downvotes: r.downvotes,
      netVotes: r.upvotes - r.downvotes,
    }));
  }

  async wasTrackPlayedRecently(venueId: number, trackId: string, hoursAgo: number): Promise<boolean> {
    const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const [result] = await db
      .select()
      .from(requests)
      .where(and(
        eq(requests.venueId, venueId),
        eq(requests.trackId, trackId),
        eq(requests.status, 'played'),
        gte(requests.playedAt, cutoffTime)
      ))
      .limit(1);
    return !!result;
  }

  async updateRequest(id: number, data: Partial<Request>): Promise<Request | undefined> {
    const [request] = await db.update(requests).set(data).where(eq(requests.id, id)).returning();
    return request;
  }

  async createVote(data: InsertVote): Promise<Vote> {
    const [vote] = await db.insert(votes).values(data).returning();
    return vote;
  }

  async getVotesByRequest(requestId: number): Promise<Vote[]> {
    return db.select().from(votes).where(eq(votes.requestId, requestId));
  }

  async hasVoted(requestId: number, userId?: number, guestId?: number): Promise<boolean> {
    if (userId) {
      const [vote] = await db.select().from(votes).where(and(eq(votes.requestId, requestId), eq(votes.userId, userId)));
      return !!vote;
    }
    if (guestId) {
      const [vote] = await db.select().from(votes).where(and(eq(votes.requestId, requestId), eq(votes.guestId, guestId)));
      return !!vote;
    }
    return false;
  }

  async getVoteType(requestId: number, userId?: number, guestId?: number): Promise<string | null> {
    if (userId) {
      const [vote] = await db.select().from(votes).where(and(eq(votes.requestId, requestId), eq(votes.userId, userId)));
      return vote?.voteType || null;
    }
    if (guestId) {
      const [vote] = await db.select().from(votes).where(and(eq(votes.requestId, requestId), eq(votes.guestId, guestId)));
      return vote?.voteType || null;
    }
    return null;
  }

  async updateVoteType(requestId: number, voteType: string, userId?: number, guestId?: number): Promise<boolean> {
    if (userId) {
      await db.update(votes).set({ voteType }).where(and(eq(votes.requestId, requestId), eq(votes.userId, userId)));
      return true;
    }
    if (guestId) {
      await db.update(votes).set({ voteType }).where(and(eq(votes.requestId, requestId), eq(votes.guestId, guestId)));
      return true;
    }
    return false;
  }

  async removeVote(requestId: number, userId?: number, guestId?: number): Promise<boolean> {
    if (userId) {
      await db.delete(votes).where(and(eq(votes.requestId, requestId), eq(votes.userId, userId)));
      return true;
    }
    if (guestId) {
      await db.delete(votes).where(and(eq(votes.requestId, requestId), eq(votes.guestId, guestId)));
      return true;
    }
    return false;
  }

  async createPartySession(data: InsertPartySession): Promise<PartySession> {
    const [session] = await db.insert(partySessions).values(data).returning();
    return session;
  }

  async getPartySessionById(id: number): Promise<PartySession | undefined> {
    const [session] = await db.select().from(partySessions).where(eq(partySessions.id, id));
    return session;
  }

  async getPartySessionByCode(code: string): Promise<PartySession | undefined> {
    const [session] = await db.select().from(partySessions).where(eq(partySessions.code, code));
    return session;
  }

  async getActivePartySession(venueId: number, date: string): Promise<PartySession | undefined> {
    const [session] = await db.select().from(partySessions).where(
      and(eq(partySessions.venueId, venueId), eq(partySessions.date, date), eq(partySessions.isActive, true))
    );
    return session;
  }

  async createGuest(data: InsertGuest): Promise<Guest> {
    const [guest] = await db.insert(guests).values(data).returning();
    return guest;
  }

  async getGuestByToken(token: string): Promise<Guest | undefined> {
    const [guest] = await db.select().from(guests).where(eq(guests.sessionToken, token));
    return guest;
  }

  async updateGuest(id: number, data: Partial<Guest>): Promise<Guest | undefined> {
    const [guest] = await db.update(guests).set(data).where(eq(guests.id, id)).returning();
    return guest;
  }

  async createBackupPlaylist(data: InsertBackupPlaylist): Promise<BackupPlaylist> {
    const [playlist] = await db.insert(backupPlaylists).values(data).returning();
    return playlist;
  }

  async getBackupPlaylistsByVenue(venueId: number): Promise<BackupPlaylist[]> {
    return db.select().from(backupPlaylists).where(eq(backupPlaylists.venueId, venueId)).orderBy(asc(backupPlaylists.position));
  }

  async deleteBackupPlaylist(id: number): Promise<boolean> {
    await db.delete(backupPlaylists).where(eq(backupPlaylists.id, id));
    return true;
  }

  async getBackupPlaylistCount(venueId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(backupPlaylists).where(eq(backupPlaylists.venueId, venueId));
    return result[0]?.count || 0;
  }

  async createOrganizationMember(data: InsertOrganizationMember): Promise<OrganizationMember> {
    const [member] = await db.insert(organizationMembers).values(data).returning();
    return member;
  }

  async getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]> {
    return db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));
  }

  async getOrganizationMemberByEmail(organizationId: number, email: string): Promise<OrganizationMember | undefined> {
    const [member] = await db.select().from(organizationMembers).where(
      and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.email, email.toLowerCase()))
    );
    return member;
  }

  async getOrganizationsByMemberEmail(email: string): Promise<Organization[]> {
    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.email, email.toLowerCase()));
    if (members.length === 0) return [];
    const orgIds = members.map(m => m.organizationId);
    return db.select().from(organizations).where(sql`${organizations.id} = ANY(${orgIds})`);
  }

  async getOrganizationsByMemberAuthId(authUserId: string): Promise<Organization[]> {
    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.authUserId, authUserId));
    if (members.length === 0) return [];
    const orgIds = members.map(m => m.organizationId);
    return db.select().from(organizations).where(sql`${organizations.id} = ANY(${orgIds})`);
  }

  async updateOrganizationMember(id: number, data: Partial<OrganizationMember>): Promise<OrganizationMember | undefined> {
    const [member] = await db.update(organizationMembers).set(data).where(eq(organizationMembers.id, id)).returning();
    return member;
  }

  async deleteOrganizationMember(id: number): Promise<boolean> {
    await db.delete(organizationMembers).where(eq(organizationMembers.id, id));
    return true;
  }

  async createAnnouncement(data: InsertAnnouncement): Promise<Announcement> {
    const [announcement] = await db.insert(announcements).values(data).returning();
    return announcement;
  }

  async getAnnouncementsByVenue(venueId: number): Promise<Announcement[]> {
    return db.select().from(announcements).where(eq(announcements.venueId, venueId)).orderBy(asc(announcements.position));
  }

  async getActiveAnnouncementsByVenue(venueId: number): Promise<Announcement[]> {
    return db.select().from(announcements).where(
      and(eq(announcements.venueId, venueId), eq(announcements.isActive, true))
    ).orderBy(asc(announcements.position));
  }

  async getAnnouncement(id: number): Promise<Announcement | undefined> {
    const [announcement] = await db.select().from(announcements).where(eq(announcements.id, id));
    return announcement;
  }

  async updateAnnouncement(id: number, data: Partial<Announcement>): Promise<Announcement | undefined> {
    const [announcement] = await db.update(announcements).set(data).where(eq(announcements.id, id)).returning();
    return announcement;
  }

  async deleteAnnouncement(id: number): Promise<boolean> {
    await db.delete(announcements).where(eq(announcements.id, id));
    return true;
  }

  async getAnnouncementCount(venueId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(announcements).where(eq(announcements.venueId, venueId));
    return result[0]?.count || 0;
  }
}

export const storage = new DatabaseStorage();
