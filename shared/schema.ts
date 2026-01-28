import { pgTable, serial, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  logoDarkUrl: text("logo_dark_url"),
  primaryColor: text("primary_color").default("#2563eb"),
  accentColor: text("accent_color").default("#f59e0b"),
  apiKey: text("api_key").unique(),
  apiKeyCreatedAt: timestamp("api_key_created_at"),
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionStatus: text("subscription_status").default("trial"),
  subscriptionPlan: text("subscription_plan").default("free"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  venues: many(venues),
}));

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  password: text("password"),
  fullName: text("full_name").notNull(),
  googleId: text("google_id"),
  role: text("role").notNull().default("staff"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  isActive: boolean("is_active").default(true),
  allowExplicit: boolean("allow_explicit").default(false),
  autoApprove: boolean("auto_approve").default(true),
  dailyRequestLimit: integer("daily_request_limit").default(5),
  backupPlaylistIds: jsonb("backup_playlist_ids").default([]),
  autoPlayEnabled: boolean("auto_play_enabled").default(false),
  scheduledStartTime: text("scheduled_start_time"),
  scheduledEndTime: text("scheduled_end_time"),
  currentlyPlayingId: text("currently_playing_id"),
  currentlyPlayingTitle: text("currently_playing_title"),
  currentlyPlayingArtist: text("currently_playing_artist"),
  currentlyPlayingAlbumCover: text("currently_playing_album_cover"),
  currentlyPlayingStartedAt: timestamp("currently_playing_started_at"),
  currentlyPlayingDuration: integer("currently_playing_duration"),
  kioskLockId: text("kiosk_lock_id"),
  kioskLockHeartbeat: timestamp("kiosk_lock_heartbeat"),
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

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  trackId: text("track_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album"),
  albumCover: text("album_cover"),
  previewUrl: text("preview_url"),
  duration: integer("duration"),
  isExplicit: boolean("is_explicit").default(false),
  requestedByUserId: integer("requested_by_user_id").references(() => users.id),
  requestedByGuestId: integer("requested_by_guest_id").references(() => guests.id),
  requesterName: text("requester_name"),
  isAutoPlay: boolean("is_auto_play").default(false),
  status: text("status").notNull().default("pending"),
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

export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => requests.id),
  userId: integer("user_id").references(() => users.id),
  guestId: integer("guest_id").references(() => guests.id),
  voteType: text("vote_type").notNull().default("up"),
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

export const partySessions = pgTable("party_sessions", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  code: text("code").notNull(),
  date: text("date").notNull(),
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

export const guests = pgTable("guests", {
  id: serial("id").primaryKey(),
  partySessionId: integer("party_session_id").notNull().references(() => partySessions.id),
  name: text("name").notNull(),
  sessionToken: text("session_token").notNull().unique(),
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

export const backupPlaylists = pgTable("backup_playlists", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  name: text("name").notNull(),
  applePlaylistId: text("apple_playlist_id").notNull(),
  trackCount: integer("track_count").default(0),
  artworkUrl: text("artwork_url"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  venueIdx: index("backup_playlists_venue_idx").on(table.venueId),
}));

export const backupPlaylistsRelations = relations(backupPlaylists, ({ one }) => ({
  venue: one(venues, {
    fields: [backupPlaylists.venueId],
    references: [venues.id],
  }),
}));

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertVenueSchema = createInsertSchema(venues).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRequestSchema = createInsertSchema(requests).omit({ id: true, requestedAt: true });
export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, createdAt: true });
export const insertPartySessionSchema = createInsertSchema(partySessions).omit({ id: true, createdAt: true });
export const insertGuestSchema = createInsertSchema(guests).omit({ id: true, createdAt: true });
export const insertBackupPlaylistSchema = createInsertSchema(backupPlaylists).omit({ id: true, createdAt: true });

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
export type BackupPlaylist = typeof backupPlaylists.$inferSelect;
export type InsertBackupPlaylist = z.infer<typeof insertBackupPlaylistSchema>;

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
  upvotes: z.number(),
  downvotes: z.number(),
  netVotes: z.number(),
  status: z.string(),
});

export type VenuePublic = z.infer<typeof venuePublicSchema>;
export type NowPlaying = z.infer<typeof nowPlayingSchema>;
export type QueueItem = z.infer<typeof queueItemSchema>;

// Auth tables for Replit Auth
export * from "./models/auth";
