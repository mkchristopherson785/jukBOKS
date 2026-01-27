import { pgTable, serial, text, integer, boolean, timestamp, jsonb, varchar, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// ORGANIZATIONS (Businesses using Jukboks)
// ============================================================================

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  
  // Branding
  logoUrl: text("logo_url"),
  logoDarkUrl: text("logo_dark_url"),
  primaryColor: text("primary_color").default("#2563eb"),
  accentColor: text("accent_color").default("#f59e0b"),
  
  // API Access
  apiKey: text("api_key").unique(),
  apiKeyCreatedAt: timestamp("api_key_created_at"),
  
  // Subscription/Billing
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionStatus: text("subscription_status").default("trial"),
  subscriptionPlan: text("subscription_plan").default("free"),
  
  // Settings
  settings: jsonb("settings").default({}),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  venues: many(venues),
}));

// ============================================================================
// USERS (Organization Staff/Managers)
// ============================================================================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  
  email: text("email").notNull(),
  password: text("password"),
  fullName: text("full_name").notNull(),
  
  // OAuth
  googleId: text("google_id"),
  
  // Role within organization
  role: text("role").notNull().default("staff"), // owner, manager, staff
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

// ============================================================================
// VENUES (Individual Locations/Rooms)
// ============================================================================

export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  
  name: text("name").notNull(),
  code: text("code").notNull().unique(), // Public venue code for party access
  
  // Queue Settings
  isActive: boolean("is_active").default(true),
  allowExplicit: boolean("allow_explicit").default(false),
  autoApprove: boolean("auto_approve").default(true),
  dailyRequestLimit: integer("daily_request_limit").default(5),
  
  // Backup Playlists (up to 10 Apple Music playlist IDs)
  backupPlaylistIds: jsonb("backup_playlist_ids").default([]),
  
  // Auto-Play Schedule
  autoPlayEnabled: boolean("auto_play_enabled").default(false),
  scheduledStartTime: text("scheduled_start_time"), // "09:00"
  scheduledEndTime: text("scheduled_end_time"), // "22:00"
  
  // Currently Playing
  currentlyPlayingId: text("currently_playing_id"),
  currentlyPlayingTitle: text("currently_playing_title"),
  currentlyPlayingArtist: text("currently_playing_artist"),
  currentlyPlayingAlbumCover: text("currently_playing_album_cover"),
  currentlyPlayingStartedAt: timestamp("currently_playing_started_at"),
  currentlyPlayingDuration: integer("currently_playing_duration"),
  
  // Kiosk Lock (only one kiosk can play at a time)
  kioskLockId: text("kiosk_lock_id"),
  kioskLockHeartbeat: timestamp("kiosk_lock_heartbeat"),
  
  // Cooldown tracking for backup playlist songs (prevent repeats within 2 hours)
  recentlyPlayedIds: jsonb("recently_played_ids").default([]),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("venues_org_idx").on(table.organizationId),
  codeIdx: index("venues_code_idx").on(table.code),
}));

export const venuesRelations = relations(venues, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [venues.organizationId],
    references: [organizations.id],
  }),
  requests: many(requests),
  partySessions: many(partySessions),
}));

// ============================================================================
// REQUESTS (Song Queue)
// ============================================================================

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  
  // Song Info
  trackId: text("track_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album"),
  albumCover: text("album_cover"),
  previewUrl: text("preview_url"),
  duration: integer("duration"),
  isExplicit: boolean("is_explicit").default(false),
  
  // Request Source
  requestedByUserId: integer("requested_by_user_id").references(() => users.id),
  requestedByGuestId: integer("requested_by_guest_id").references(() => guests.id),
  requesterName: text("requester_name"), // Display name
  isAutoPlay: boolean("is_auto_play").default(false), // From backup playlist
  
  // Status
  status: text("status").notNull().default("pending"), // pending, approved, playing, played, rejected
  
  // Timestamps
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  playedAt: timestamp("played_at"),
}, (table) => ({
  venueIdx: index("requests_venue_idx").on(table.venueId),
  statusIdx: index("requests_status_idx").on(table.status),
}));

export const requestsRelations = relations(requests, ({ one, many }) => ({
  venue: one(venues, {
    fields: [requests.venueId],
    references: [venues.id],
  }),
  requestedByUser: one(users, {
    fields: [requests.requestedByUserId],
    references: [users.id],
  }),
  requestedByGuest: one(guests, {
    fields: [requests.requestedByGuestId],
    references: [guests.id],
  }),
  votes: many(votes),
}));

// ============================================================================
// VOTES (Upvotes on Requests)
// ============================================================================

export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => requests.id),
  
  // Who voted (one of these will be set)
  userId: integer("user_id").references(() => users.id),
  guestId: integer("guest_id").references(() => guests.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  requestIdx: index("votes_request_idx").on(table.requestId),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  request: one(requests, {
    fields: [votes.requestId],
    references: [requests.id],
  }),
  user: one(users, {
    fields: [votes.userId],
    references: [users.id],
  }),
  guest: one(guests, {
    fields: [votes.guestId],
    references: [guests.id],
  }),
}));

// ============================================================================
// PARTY SESSIONS (Daily QR Codes)
// ============================================================================

export const partySessions = pgTable("party_sessions", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  
  code: text("code").notNull(), // Daily party code
  date: text("date").notNull(), // YYYY-MM-DD
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  venueIdx: index("party_sessions_venue_idx").on(table.venueId),
  codeIdx: index("party_sessions_code_idx").on(table.code),
}));

export const partySessionsRelations = relations(partySessions, ({ one, many }) => ({
  venue: one(venues, {
    fields: [partySessions.venueId],
    references: [venues.id],
  }),
  guests: many(guests),
}));

// ============================================================================
// GUESTS (Anonymous Party Attendees)
// ============================================================================

export const guests = pgTable("guests", {
  id: serial("id").primaryKey(),
  partySessionId: integer("party_session_id").notNull().references(() => partySessions.id),
  
  name: text("name").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  
  // Request tracking
  requestCount: integer("request_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
}, (table) => ({
  partyIdx: index("guests_party_idx").on(table.partySessionId),
  tokenIdx: index("guests_token_idx").on(table.sessionToken),
}));

export const guestsRelations = relations(guests, ({ one, many }) => ({
  partySession: one(partySessions, {
    fields: [guests.partySessionId],
    references: [partySessions.id],
  }),
  requests: many(requests),
  votes: many(votes),
}));

// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertVenueSchema = createInsertSchema(venues).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRequestSchema = createInsertSchema(requests).omit({ id: true, requestedAt: true });
export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, createdAt: true });
export const insertPartySessionSchema = createInsertSchema(partySessions).omit({ id: true, createdAt: true });
export const insertGuestSchema = createInsertSchema(guests).omit({ id: true, createdAt: true });

// ============================================================================
// TYPES
// ============================================================================

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Venue = typeof venues.$inferSelect;
export type InsertVenue = z.infer<typeof insertVenueSchema>;

export type Request = typeof requests.$inferSelect;
export type InsertRequest = z.infer<typeof insertRequestSchema>;

export type Vote = typeof votes.$inferSelect;
export type InsertVote = z.infer<typeof insertVoteSchema>;

export type PartySession = typeof partySessions.$inferSelect;
export type InsertPartySession = z.infer<typeof insertPartySessionSchema>;

export type Guest = typeof guests.$inferSelect;
export type InsertGuest = z.infer<typeof insertGuestSchema>;

// ============================================================================
// API TYPES (for integration)
// ============================================================================

export const venuePublicSchema = z.object({
  code: z.string(),
  name: z.string(),
  organizationName: z.string(),
  logoUrl: z.string().optional(),
  logoDarkUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  allowExplicit: z.boolean(),
  dailyRequestLimit: z.number(),
});

export const nowPlayingSchema = z.object({
  trackId: z.string().nullable(),
  title: z.string().nullable(),
  artist: z.string().nullable(),
  albumCover: z.string().nullable(),
  startedAt: z.string().nullable(),
  duration: z.number().nullable(),
});

export const queueItemSchema = z.object({
  id: z.number(),
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  albumCover: z.string().optional(),
  requesterName: z.string().optional(),
  isAutoPlay: z.boolean(),
  voteCount: z.number(),
  status: z.string(),
});

export type VenuePublic = z.infer<typeof venuePublicSchema>;
export type NowPlaying = z.infer<typeof nowPlayingSchema>;
export type QueueItem = z.infer<typeof queueItemSchema>;
