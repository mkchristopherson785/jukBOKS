import { eq, and, desc, sql, gte, asc, or } from "drizzle-orm";
import { db } from "./db";
import {
  organizations, users, venues, requests, votes, partySessions, guests, backupPlaylists, organizationMembers, announcements, announcementGroups, bannedSongs, guestFavorites,
  type Organization, type InsertOrganization,
  type User, type InsertUser,
  type Venue, type InsertVenue,
  type Request, type InsertRequest,
  type Vote, type InsertVote,
  type PartySession, type InsertPartySession,
  type Guest, type InsertGuest,
  type BackupPlaylist, type InsertBackupPlaylist,
  type OrganizationMember, type InsertOrganizationMember,
  type AnnouncementGroup, type InsertAnnouncementGroup,
  type Announcement, type InsertAnnouncement,
  type BannedSong,
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
  updateOrganization(id: number, data: Partial<Organization>): Promise<Organization | undefined>;
  
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
  wasTrackPlayedRecentlyMinutes(venueId: number, trackId: string, minutes: number): Promise<boolean>;
  getArtistPlayCountRecent(venueId: number, artist: string, minutes: number): Promise<number>;
  
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
  updateBackupPlaylist(id: number, data: Partial<BackupPlaylist>): Promise<BackupPlaylist | undefined>;
  deleteBackupPlaylist(id: number): Promise<boolean>;
  getBackupPlaylistCount(venueId: number): Promise<number>;
  
  createOrganizationMember(data: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]>;
  getOrganizationMemberByEmail(organizationId: number, email: string): Promise<OrganizationMember | undefined>;
  getOrganizationsByMemberEmail(email: string): Promise<Organization[]>;
  getOrganizationsByMemberAuthId(authUserId: string): Promise<Organization[]>;
  updateOrganizationMember(id: number, data: Partial<OrganizationMember>): Promise<OrganizationMember | undefined>;
  deleteOrganizationMember(id: number): Promise<boolean>;
  deleteOrganization(id: number): Promise<boolean>;
  
  createAnnouncement(data: InsertAnnouncement): Promise<Announcement>;
  getAnnouncementsByVenue(venueId: number): Promise<Announcement[]>;
  getActiveAnnouncementsByVenue(venueId: number): Promise<Announcement[]>;
  getAnnouncement(id: number): Promise<Announcement | undefined>;
  updateAnnouncement(id: number, data: Partial<Announcement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: number): Promise<boolean>;
  getAnnouncementCount(venueId: number): Promise<number>;
  
  banSong(venueId: number, trackId: string, title: string, artist: string, albumCover?: string): Promise<any>;
  unbanSong(venueId: number, trackId: string): Promise<boolean>;
  getBannedSongs(venueId: number): Promise<any[]>;
  isSongBanned(venueId: number, trackId: string): Promise<boolean>;
  getPlayHistory(venueId: number, limit?: number): Promise<any[]>;

  getGuestFavorites(venueId: number, guestName: string): Promise<any[]>;
  addGuestFavorite(venueId: number, guestName: string, data: { trackId: string; title: string; artist: string; album?: string; albumCover?: string; previewUrl?: string; duration?: number; isExplicit?: boolean }): Promise<any>;
  removeGuestFavorite(venueId: number, guestName: string, trackId: string): Promise<boolean>;
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

  async updateOrganization(id: number, data: Partial<Organization>): Promise<Organization | undefined> {
    const [org] = await db.update(organizations).set({ ...data, updatedAt: new Date() }).where(eq(organizations.id, id)).returning();
    return org;
  }

  async getOrganizationByApiKey(apiKey: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.apiKey, apiKey));
    return org;
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(organizations.createdAt);
  }

  async getAllVenues(): Promise<Venue[]> {
    return db.select().from(venues).orderBy(venues.createdAt);
  }
  
  async getGuestCountsByVenue(): Promise<Map<number, number>> {
    const result = await db
      .select({
        venueId: partySessions.venueId,
        count: sql<number>`count(${guests.id})::int`,
      })
      .from(guests)
      .innerJoin(partySessions, eq(guests.partySessionId, partySessions.id))
      .groupBy(partySessions.venueId);
    
    const counts = new Map<number, number>();
    for (const row of result) {
      counts.set(row.venueId, row.count);
    }
    return counts;
  }

  async getGuestsByVenue(venueId: number): Promise<any[]> {
    return db
      .select({
        id: guests.id,
        nickname: guests.name,
        requestCount: guests.requestCount,
        createdAt: guests.createdAt,
        lastActiveAt: guests.lastActiveAt,
      })
      .from(guests)
      .innerJoin(partySessions, eq(guests.partySessionId, partySessions.id))
      .where(eq(partySessions.venueId, venueId))
      .orderBy(desc(guests.lastActiveAt));
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
    // Delete all related records first to avoid foreign key constraints
    await db.delete(announcements).where(eq(announcements.venueId, id));
    await db.delete(bannedSongs).where(eq(bannedSongs.venueId, id));
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
        sql`CASE WHEN ${requests.isAutoPlay} = false THEN 0 ELSE 1 END`,
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

  async wasTrackPlayedRecentlyMinutes(venueId: number, trackId: string, minutes: number): Promise<boolean> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
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

  async getArtistPlayCountRecent(venueId: number, artist: string, minutes: number): Promise<number> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    const results = await db
      .select()
      .from(requests)
      .where(and(
        eq(requests.venueId, venueId),
        eq(requests.status, 'played'),
        gte(requests.playedAt, cutoffTime)
      ));
    return results.filter(r => r.artist?.toLowerCase() === artist.toLowerCase()).length;
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

  async updateBackupPlaylist(id: number, data: Partial<BackupPlaylist>): Promise<BackupPlaylist | undefined> {
    const [updated] = await db.update(backupPlaylists).set(data).where(eq(backupPlaylists.id, id)).returning();
    return updated;
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

  async deleteOrganization(id: number): Promise<boolean> {
    // Get all venues for this org and delete them first
    const orgVenues = await db.select().from(venues).where(eq(venues.organizationId, id));
    for (const venue of orgVenues) {
      await this.deleteVenue(venue.id);
    }
    // Delete organization members
    await db.delete(organizationMembers).where(eq(organizationMembers.id, id));
    // Delete the organization
    await db.delete(organizations).where(eq(organizations.id, id));
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

  async createAnnouncementGroup(data: InsertAnnouncementGroup): Promise<AnnouncementGroup> {
    const [group] = await db.insert(announcementGroups).values(data).returning();
    return group;
  }

  async getAnnouncementGroupsByVenue(venueId: number): Promise<AnnouncementGroup[]> {
    return db.select().from(announcementGroups).where(eq(announcementGroups.venueId, venueId)).orderBy(asc(announcementGroups.position));
  }

  async getAnnouncementGroup(id: number): Promise<AnnouncementGroup | undefined> {
    const [group] = await db.select().from(announcementGroups).where(eq(announcementGroups.id, id));
    return group;
  }

  async updateAnnouncementGroup(id: number, data: Partial<AnnouncementGroup>): Promise<AnnouncementGroup | undefined> {
    const [group] = await db.update(announcementGroups).set(data).where(eq(announcementGroups.id, id)).returning();
    return group;
  }

  async deleteAnnouncementGroup(id: number): Promise<boolean> {
    await db.delete(announcements).where(eq(announcements.groupId, id));
    await db.delete(announcementGroups).where(eq(announcementGroups.id, id));
    return true;
  }

  async getAnnouncementsByGroup(groupId: number): Promise<Announcement[]> {
    return db.select().from(announcements).where(eq(announcements.groupId, groupId)).orderBy(asc(announcements.position));
  }

  async getActiveAnnouncementsByGroup(groupId: number): Promise<Announcement[]> {
    return db.select().from(announcements).where(
      and(eq(announcements.groupId, groupId), eq(announcements.isActive, true))
    ).orderBy(asc(announcements.position));
  }

  async banSong(venueId: number, trackId: string, title: string, artist: string, albumCover?: string): Promise<BannedSong> {
    const [banned] = await db.insert(bannedSongs).values({
      venueId,
      trackId,
      title,
      artist,
      albumCover,
    }).returning();
    return banned;
  }

  async unbanSong(venueId: number, trackId: string): Promise<boolean> {
    await db.delete(bannedSongs).where(and(eq(bannedSongs.venueId, venueId), eq(bannedSongs.trackId, trackId)));
    return true;
  }

  async getBannedSongs(venueId: number): Promise<BannedSong[]> {
    return db.select().from(bannedSongs).where(eq(bannedSongs.venueId, venueId)).orderBy(desc(bannedSongs.bannedAt));
  }

  async isSongBanned(venueId: number, trackId: string): Promise<boolean> {
    const [result] = await db.select().from(bannedSongs).where(and(eq(bannedSongs.venueId, venueId), eq(bannedSongs.trackId, trackId))).limit(1);
    return !!result;
  }

  async getPlayHistory(venueId: number, limit: number = 50): Promise<Request[]> {
    return db.select().from(requests).where(and(eq(requests.venueId, venueId), eq(requests.status, "played"))).orderBy(desc(requests.playedAt)).limit(limit);
  }

  async getVenueAnalytics(venueId: number, days: number = 30): Promise<{
    totalPlayed: number;
    totalRequests: number;
    uniqueGuests: number;
    topSongs: { trackId: string; title: string; artist: string; albumCover: string | null; count: number }[];
    topArtists: { artist: string; count: number }[];
    peakHours: { hour: number; count: number }[];
    dailyPlays: { date: string; count: number }[];
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalPlayedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(requests)
      .where(and(eq(requests.venueId, venueId), eq(requests.status, "played"), gte(requests.playedAt, since)));
    const totalPlayed = totalPlayedResult?.count || 0;

    const [totalRequestsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(requests)
      .where(and(eq(requests.venueId, venueId), eq(requests.isAutoPlay, false), gte(requests.requestedAt, since)));
    const totalRequests = totalRequestsResult?.count || 0;

    const [uniqueGuestsResult] = await db
      .select({ count: sql<number>`count(distinct ${requests.requestedByGuestId})::int` })
      .from(requests)
      .where(and(eq(requests.venueId, venueId), gte(requests.requestedAt, since)));
    const uniqueGuests = uniqueGuestsResult?.count || 0;

    const topSongs = await db
      .select({
        trackId: requests.trackId,
        title: requests.title,
        artist: requests.artist,
        albumCover: requests.albumCover,
        count: sql<number>`count(*)::int`,
      })
      .from(requests)
      .where(and(eq(requests.venueId, venueId), eq(requests.status, "played"), gte(requests.playedAt, since)))
      .groupBy(requests.trackId, requests.title, requests.artist, requests.albumCover)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    const topArtists = await db
      .select({
        artist: requests.artist,
        count: sql<number>`count(*)::int`,
      })
      .from(requests)
      .where(and(eq(requests.venueId, venueId), eq(requests.status, "played"), gte(requests.playedAt, since)))
      .groupBy(requests.artist)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    const peakHours = await db
      .select({
        hour: sql<number>`extract(hour from ${requests.playedAt})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(requests)
      .where(and(eq(requests.venueId, venueId), eq(requests.status, "played"), gte(requests.playedAt, since)))
      .groupBy(sql`extract(hour from ${requests.playedAt})`)
      .orderBy(sql`extract(hour from ${requests.playedAt})`);

    const dailyPlays = await db
      .select({
        date: sql<string>`to_char(${requests.playedAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(requests)
      .where(and(eq(requests.venueId, venueId), eq(requests.status, "played"), gte(requests.playedAt, since)))
      .groupBy(sql`to_char(${requests.playedAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${requests.playedAt}, 'YYYY-MM-DD')`);

    return { totalPlayed, totalRequests, uniqueGuests, topSongs, topArtists, peakHours, dailyPlays };
  }

  async getGuestFavorites(venueId: number, guestName: string): Promise<any[]> {
    return db
      .select()
      .from(guestFavorites)
      .where(and(
        eq(guestFavorites.venueId, venueId),
        eq(guestFavorites.guestName, guestName.toLowerCase().trim())
      ))
      .orderBy(desc(guestFavorites.createdAt))
      .limit(50);
  }

  async addGuestFavorite(venueId: number, guestName: string, data: { trackId: string; title: string; artist: string; album?: string; albumCover?: string; previewUrl?: string; duration?: number; isExplicit?: boolean }): Promise<any> {
    const normalizedName = guestName.toLowerCase().trim();
    const existing = await db
      .select()
      .from(guestFavorites)
      .where(and(
        eq(guestFavorites.venueId, venueId),
        eq(guestFavorites.guestName, normalizedName),
        eq(guestFavorites.trackId, data.trackId)
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(guestFavorites)
        .set({ createdAt: new Date() })
        .where(eq(guestFavorites.id, existing[0].id))
        .returning();
      return updated;
    }

    const [fav] = await db.insert(guestFavorites).values({
      venueId,
      guestName: normalizedName,
      trackId: data.trackId,
      title: data.title,
      artist: data.artist,
      album: data.album || "",
      albumCover: data.albumCover || "",
      previewUrl: data.previewUrl,
      duration: data.duration,
      isExplicit: data.isExplicit || false,
    }).returning();
    return fav;
  }

  async removeGuestFavorite(venueId: number, guestName: string, trackId: string): Promise<boolean> {
    const result = await db
      .delete(guestFavorites)
      .where(and(
        eq(guestFavorites.venueId, venueId),
        eq(guestFavorites.guestName, guestName.toLowerCase().trim()),
        eq(guestFavorites.trackId, trackId)
      ));
    return true;
  }
}

export const storage = new DatabaseStorage();
