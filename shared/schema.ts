import { pgTable, serial, text, integer, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
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
  blockHolidayMusic: boolean("block_holiday_music").default(false),
  autoApprove: boolean("auto_approve").default(true),
  dailyRequestLimit: integer("daily_request_limit").default(5),
  backupPlaylistIds: jsonb("backup_playlist_ids").default([]),
  autoPlayEnabled: boolean("auto_play_enabled").default(false),
  songCooldownMinutes: integer("song_cooldown_minutes").default(120),
  artistCooldownMinutes: integer("artist_cooldown_minutes").default(30),
  artistMaxPlaysPerHour: integer("artist_max_plays_per_hour").default(3),
  kioskScheduleEnabled: boolean("kiosk_schedule_enabled").default(false),
  kioskScheduleDays: jsonb("kiosk_schedule_days").default(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  kioskStartTime: text("kiosk_start_time").default("12:00"),
  kioskEndTime: text("kiosk_end_time").default("21:00"),
  kioskDaySchedules: jsonb("kiosk_day_schedules").default({}),
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
  kioskPlaybackStatus: text("kiosk_playback_status").default("idle"),
  kioskDeviceName: text("kiosk_device_name"),
  kioskAlertEmail: text("kiosk_alert_email"),
  kioskLastAlertSentAt: timestamp("kiosk_last_alert_sent_at"),
  urgentAnnouncementText: text("urgent_announcement_text"),
  urgentAnnouncementAudioUrl: text("urgent_announcement_audio_url"),
  urgentAnnouncementTriggeredAt: timestamp("urgent_announcement_triggered_at"),
  recentlyPlayedIds: jsonb("recently_played_ids").default([]),
  announcementFrequencyType: text("announcement_frequency_type"),
  announcementFrequency: integer("announcement_frequency").default(5),
  announcementPlayMode: text("announcement_play_mode").default("sequential"),
  lastAnnouncementAt: timestamp("last_announcement_at"),
  songsSinceAnnouncement: integer("songs_since_announcement").default(0),
  sonosEnabled: boolean("sonos_enabled").default(false),
  sonosAccessToken: text("sonos_access_token"),
  sonosRefreshToken: text("sonos_refresh_token"),
  sonosTokenExpiresAt: timestamp("sonos_token_expires_at"),
  sonosHouseholdId: text("sonos_household_id"),
  sonosGroupId: text("sonos_group_id"),
  sonosGroupName: text("sonos_group_name"),
  appleMusicUserToken: text("apple_music_user_token"),
  appleMusicUserTokenUpdatedAt: timestamp("apple_music_user_token_updated_at"),
  kioskLayout: text("kiosk_layout").default("default"),
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
  weight: integer("weight").notNull().default(3),
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

export const announcementGroups = pgTable("announcement_groups", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  name: text("name").notNull().default("Announcements"),
  frequencyType: text("frequency_type").notNull().default("songs"),
  frequency: integer("frequency").notNull().default(5),
  playMode: text("play_mode").notNull().default("sequential"),
  position: integer("position").notNull().default(0),
  lastPlayedAt: timestamp("last_played_at"),
  songsSincePlay: integer("songs_since_play").default(0),
  lastPlayedIndex: integer("last_played_index").default(-1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  venueIdx: index("announcement_groups_venue_idx").on(table.venueId),
}));

export const announcementGroupsRelations = relations(announcementGroups, ({ one, many }) => ({
  venue: one(venues, {
    fields: [announcementGroups.venueId],
    references: [venues.id],
  }),
  announcements: many(announcements),
}));

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  groupId: integer("group_id").references(() => announcementGroups.id),
  name: text("name").notNull(),
  audioUrl: text("audio_url").notNull(),
  duration: integer("duration"),
  isActive: boolean("is_active").default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  venueIdx: index("announcements_venue_idx").on(table.venueId),
  groupIdx: index("announcements_group_idx").on(table.groupId),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  venue: one(venues, {
    fields: [announcements.venueId],
    references: [venues.id],
  }),
  group: one(announcementGroups, {
    fields: [announcements.groupId],
    references: [announcementGroups.id],
  }),
}));

// Banned songs per venue
export const bannedSongs = pgTable("banned_songs", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  trackId: text("track_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  albumCover: text("album_cover"),
  bannedAt: timestamp("banned_at").defaultNow().notNull(),
}, (table) => ({
  venueIdx: index("banned_songs_venue_idx").on(table.venueId),
  trackIdx: index("banned_songs_track_idx").on(table.trackId),
}));

export const bannedSongsRelations = relations(bannedSongs, ({ one }) => ({
  venue: one(venues, {
    fields: [bannedSongs.venueId],
    references: [venues.id],
  }),
}));

// Organization members for shared admin access
export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  authUserId: text("auth_user_id"),
  role: text("role").notNull().default("admin"),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  joinedAt: timestamp("joined_at"),
}, (table) => ({
  orgIdx: index("org_members_org_idx").on(table.organizationId),
  emailIdx: index("org_members_email_idx").on(table.email),
  authUserIdx: index("org_members_auth_user_idx").on(table.authUserId),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
}));

export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({ id: true, invitedAt: true });
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertVenueSchema = createInsertSchema(venues).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRequestSchema = createInsertSchema(requests).omit({ id: true, requestedAt: true });
export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, createdAt: true });
export const insertPartySessionSchema = createInsertSchema(partySessions).omit({ id: true, createdAt: true });
export const insertGuestSchema = createInsertSchema(guests).omit({ id: true, createdAt: true });
export const insertBackupPlaylistSchema = createInsertSchema(backupPlaylists).omit({ id: true, createdAt: true });
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });

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
export type AnnouncementGroup = typeof announcementGroups.$inferSelect;
export type InsertAnnouncementGroup = typeof announcementGroups.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type BannedSong = typeof bannedSongs.$inferSelect;

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

export const guestFavorites = pgTable("guest_favorites", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id),
  guestName: text("guest_name").notNull(),
  trackId: text("track_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album").default(""),
  albumCover: text("album_cover").default(""),
  previewUrl: text("preview_url"),
  duration: integer("duration"),
  isExplicit: boolean("is_explicit").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  venueGuestIdx: index("guest_favorites_venue_guest_idx").on(table.venueId, table.guestName),
  uniqueTrack: uniqueIndex("guest_favorites_unique_track_idx").on(table.venueId, table.guestName, table.trackId),
}));

export type GuestFavorite = typeof guestFavorites.$inferSelect;

export type VenuePublic = z.infer<typeof venuePublicSchema>;
export type NowPlaying = z.infer<typeof nowPlayingSchema>;
export type QueueItem = z.infer<typeof queueItemSchema>;

// Auth tables for Replit Auth
export * from "./models/auth";
