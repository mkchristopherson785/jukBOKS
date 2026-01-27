import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  organizations, users, venues, requests, votes, partySessions, guests,
  type Organization, type InsertOrganization,
  type User, type InsertUser,
  type Venue, type InsertVenue,
  type Request, type InsertRequest,
  type Vote, type InsertVote,
  type PartySession, type InsertPartySession,
  type Guest, type InsertGuest,
} from "../shared/schema";

export interface IStorage {
  createOrganization(data: InsertOrganization): Promise<Organization>;
  getOrganization(id: number): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  getOrganizationByApiKey(apiKey: string): Promise<Organization | undefined>;
  
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
  getQueueWithVotes(venueId: number): Promise<(Request & { voteCount: number })[]>;
  updateRequest(id: number, data: Partial<Request>): Promise<Request | undefined>;
  
  createVote(data: InsertVote): Promise<Vote>;
  getVotesByRequest(requestId: number): Promise<Vote[]>;
  hasVoted(requestId: number, userId?: number, guestId?: number): Promise<boolean>;
  removeVote(requestId: number, userId?: number, guestId?: number): Promise<boolean>;
  
  createPartySession(data: InsertPartySession): Promise<PartySession>;
  getPartySessionById(id: number): Promise<PartySession | undefined>;
  getPartySessionByCode(code: string): Promise<PartySession | undefined>;
  getActivePartySession(venueId: number, date: string): Promise<PartySession | undefined>;
  
  createGuest(data: InsertGuest): Promise<Guest>;
  getGuestByToken(token: string): Promise<Guest | undefined>;
  updateGuest(id: number, data: Partial<Guest>): Promise<Guest | undefined>;
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

  async getQueueWithVotes(venueId: number): Promise<(Request & { voteCount: number })[]> {
    const result = await db
      .select({
        request: requests,
        voteCount: sql<number>`COALESCE(COUNT(${votes.id}), 0)::int`,
      })
      .from(requests)
      .leftJoin(votes, eq(requests.id, votes.requestId))
      .where(and(
        eq(requests.venueId, venueId),
        sql`${requests.status} IN ('pending', 'approved')`
      ))
      .groupBy(requests.id)
      .orderBy(desc(sql`COALESCE(COUNT(${votes.id}), 0)`), requests.requestedAt);

    return result.map(r => ({ ...r.request, voteCount: r.voteCount }));
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

  async removeVote(requestId: number, userId?: number, guestId?: number): Promise<boolean> {
    if (userId) {
      const result = await db.delete(votes).where(and(eq(votes.requestId, requestId), eq(votes.userId, userId)));
      return true;
    }
    if (guestId) {
      const result = await db.delete(votes).where(and(eq(votes.requestId, requestId), eq(votes.guestId, guestId)));
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
}

export const storage = new DatabaseStorage();
