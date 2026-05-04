const API_BASE = "";

export async function fetchVenue(code: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${code}`);
  if (!res.ok) throw new Error("Failed to fetch venue");
  return res.json();
}

export async function fetchQueue(code: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${code}/queue`);
  if (!res.ok) throw new Error("Failed to fetch queue");
  return res.json();
}

export async function fetchNowPlaying(code: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${code}/now-playing`);
  if (!res.ok) throw new Error("Failed to fetch now playing");
  return res.json();
}

export async function sendKioskHeartbeat(code: string, options: {
  deviceId: string;
  deviceName: string;
  playbackStatus: "idle" | "playing" | "paused" | "scheduled";
}) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${code}/kiosk-heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error("Failed to send heartbeat");
  return res.json() as Promise<{ success: boolean; hasLock: boolean; lockedBy?: string; timestamp: string }>;
}

export async function fetchKioskStatus(code: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${code}/kiosk-status`);
  if (!res.ok) throw new Error("Failed to fetch kiosk status");
  return res.json();
}

export async function skipSong(venueCode: string, requestId: number) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/played/${requestId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to skip song");
  return res.json();
}

export async function fetchParty(partyCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/party/${partyCode}`);
  if (!res.ok) throw new Error("Party not found");
  return res.json();
}

export async function joinParty(partyCode: string, name: string) {
  const res = await fetch(`${API_BASE}/api/v1/party/${partyCode}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to join party");
  return res.json();
}

export async function submitRequest(
  venueCode: string,
  song: {
    trackId: string;
    title: string;
    artist: string;
    album?: string;
    albumCover?: string;
    duration?: number;
    isExplicit?: boolean;
    previewUrl?: string;
  },
  guestToken?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (guestToken) headers["X-Guest-Token"] = guestToken;

  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/request`, {
    method: "POST",
    headers,
    body: JSON.stringify(song),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Failed to submit request: ${res.status}`);
  }
  return data;
}

export async function submitVote(venueCode: string, requestId: number, voteType: "up" | "down" = "up", guestToken?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (guestToken) headers["X-Guest-Token"] = guestToken;

  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/vote`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requestId, voteType }),
  });
  return res.json();
}

export async function fetchQRCode(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/qrcode`);
  if (!res.ok) throw new Error("Failed to generate QR code");
  return res.json();
}

export async function setupDemo() {
  const res = await fetch(`${API_BASE}/api/setup/demo`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to setup demo");
  return res.json();
}

// Authenticated user endpoints
export async function fetchMyOrganization() {
  const res = await fetch(`${API_BASE}/api/me/organization`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateOrganization(data: { name?: string; logoUrl?: string; logoDarkUrl?: string; primaryColor?: string; accentColor?: string }) {
  const res = await fetch(`${API_BASE}/api/me/organization`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchMyVenues() {
  const res = await fetch(`${API_BASE}/api/me/venues`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function createVenue(data: {
  name: string;
  allowExplicit?: boolean;
  autoApprove?: boolean;
  dailyRequestLimit?: number;
}) {
  const res = await fetch(`${API_BASE}/api/me/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateVenue(venueId: number, data: {
  name?: string;
  allowExplicit?: boolean;
  autoApprove?: boolean;
  dailyRequestLimit?: number;
  isActive?: boolean;
  kioskScheduleEnabled?: boolean;
  kioskScheduleDays?: string[];
  kioskStartTime?: string;
  kioskEndTime?: string;
  kioskDaySchedules?: Record<string, { startTime: string; endTime: string }>;
  kioskAlertEmail?: string;
  songCooldownMinutes?: number;
  artistCooldownMinutes?: number;
  artistMaxPlaysPerHour?: number;
}) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function deleteVenue(venueId: number) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

// Team management
export async function fetchTeam() {
  const res = await fetch(`${API_BASE}/api/me/team`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function inviteTeamMember(email: string, role: string = "admin") {
  const res = await fetch(`${API_BASE}/api/me/team`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function removeTeamMember(memberId: number) {
  const res = await fetch(`${API_BASE}/api/me/team/${memberId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

// Backup playlists
export async function fetchBackupPlaylists(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/backup-playlists`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.playlists || [];
}

export async function addBackupPlaylist(venueId: number, playlistUrl: string) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/backup-playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ playlistUrl }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function searchPlaylists(term: string) {
  const res = await fetch(`${API_BASE}/api/apple-music/search-playlists?term=${encodeURIComponent(term)}`);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.results || [];
}

export async function addBackupPlaylistById(venueId: number, playlist: { id: string; name: string; trackCount: number; artworkUrl: string | null; isLibrary?: boolean }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/backup-playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ 
      playlistId: playlist.id,
      name: playlist.name,
      trackCount: playlist.trackCount,
      artworkUrl: playlist.artworkUrl,
      isLibrary: playlist.isLibrary || false
    }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function removeBackupPlaylist(venueId: number, playlistId: string) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/backup-playlists/${playlistId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateBackupPlaylistWeight(venueId: number, playlistId: number, weight: number) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/backup-playlists/${playlistId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ weight }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

// Live Listeners
export async function registerListener(venueCode: string, listenerId: string, name?: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/listeners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listenerId, name }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function unregisterListener(venueCode: string, listenerId: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/listeners/${listenerId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchListeners(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/listeners`);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateRequestStatus(venueCode: string, requestId: number, action: "approve" | "reject" | "remove") {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/requests/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error("Failed to update request");
  return res.json();
}

export async function clearQueue(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/queue`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to clear queue");
  return res.json();
}

// Announcements
export interface Announcement {
  id: number;
  venueId: number;
  name: string;
  audioUrl: string;
  duration: number | null;
  isActive: boolean;
  position: number;
  createdAt: string;
}

export async function fetchAnnouncements(venueId: number): Promise<{ announcements: Announcement[] }> {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcements`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function createAnnouncement(venueId: number, data: { name: string; audioUrl: string; duration?: number }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.message || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function updateAnnouncement(venueId: number, announcementId: number, data: { name?: string; isActive?: boolean }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcements/${announcementId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function deleteAnnouncement(venueId: number, announcementId: number) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcements/${announcementId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateAnnouncementSettings(venueId: number, settings: { frequencyType?: string | null; frequency?: number; playMode?: string }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcement-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchNextAnnouncement(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/next-announcement`);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function markAnnouncementPlayed(venueCode: string, groupId?: number, announcementId?: number, urgent?: boolean, deviceId?: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/announcement-played`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, announcementId, urgent, deviceId }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

// Announcement Groups API
export interface AnnouncementGroup {
  id: number;
  venueId: number;
  name: string;
  frequencyType: string;
  frequency: number;
  playMode: string;
  position: number;
  lastPlayedAt: string | null;
  songsSincePlay: number;
  lastPlayedIndex: number;
  createdAt: string;
  announcements: Announcement[];
}

export async function fetchAnnouncementGroups(venueId: number): Promise<{ groups: AnnouncementGroup[] }> {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcement-groups`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function createAnnouncementGroup(venueId: number, data: { name?: string; frequencyType?: string; frequency?: number; playMode?: string }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcement-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateAnnouncementGroup(venueId: number, groupId: number, data: { name?: string; frequencyType?: string; frequency?: number; playMode?: string }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcement-groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function deleteAnnouncementGroup(venueId: number, groupId: number) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcement-groups/${groupId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function addAnnouncementToGroup(venueId: number, groupId: number, data: { name: string; audioUrl: string; duration?: number }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/announcement-groups/${groupId}/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.message || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function markSongFinished(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/song-finished`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

// Play History & Banned Songs
export async function fetchPlayHistory(venueId: number) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/history`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.history || [];
}

export async function fetchBannedSongs(venueId: number) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/banned`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.bannedSongs || [];
}

export async function banSong(venueId: number, song: { trackId: string; title: string; artist: string; albumCover?: string }) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/ban`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(song),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function unbanSong(venueId: number, trackId: string) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/ban/${encodeURIComponent(trackId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

// Sonos integration
export interface SonosStatus {
  enabled: boolean;
  connected: boolean;
  householdId: string | null;
  groupId: string | null;
  groupName: string | null;
  groups: { id: string; name: string }[];
}

export async function fetchSonosStatus(venueCode: string): Promise<SonosStatus> {
  const res = await fetch(`${API_BASE}/api/venues/${venueCode}/sonos`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateSonosSettings(venueCode: string, data: { groupId?: string; enabled?: boolean }) {
  const res = await fetch(`${API_BASE}/api/venues/${venueCode}/sonos`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function disconnectSonos(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/venues/${venueCode}/sonos`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export function getSonosConnectUrl(venueCode: string): string {
  return `${API_BASE}/api/sonos/connect/${venueCode}`;
}

export async function sonosPlayTrack(
  venueCode: string, 
  trackId: string,
  trackName?: string,
  artist?: string,
  album?: string
) {
  const res = await fetch(`${API_BASE}/api/venues/${venueCode}/sonos/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ trackId, trackName, artist, album }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function sonosControl(venueCode: string, action: 'play' | 'pause' | 'skipToNextTrack') {
  const res = await fetch(`${API_BASE}/api/venues/${venueCode}/sonos/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function checkSuperAdmin(): Promise<{ isSuperAdmin: boolean }> {
  const res = await fetch(`${API_BASE}/api/super-admin/check`, {
    credentials: "include",
  });
  if (!res.ok) return { isSuperAdmin: false };
  return res.json();
}

export async function fetchAllOrganizations() {
  const res = await fetch(`${API_BASE}/api/super-admin/organizations`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch organizations");
  return res.json();
}

export async function fetchAllVenues() {
  const res = await fetch(`${API_BASE}/api/super-admin/venues`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch venues");
  return res.json();
}

export async function superAdminDeleteVenue(venueId: number) {
  const res = await fetch(`${API_BASE}/api/super-admin/venues/${venueId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete venue");
  return res.json();
}

export async function superAdminDeleteOrganization(orgId: number) {
  const res = await fetch(`${API_BASE}/api/super-admin/organizations/${orgId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete organization");
  return res.json();
}

export async function fetchApiKey(): Promise<{ apiKey: string | null; maskedKey: string | null }> {
  const res = await fetch(`${API_BASE}/api/me/api-key`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch API key");
  return res.json();
}

export async function generateApiKey(): Promise<{ apiKey: string }> {
  const res = await fetch(`${API_BASE}/api/me/api-key`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to generate API key");
  return res.json();
}

export async function fetchVenueAnalytics(venueId: number, days: number = 30) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/analytics?days=${days}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}

export async function superAdminGetVenueGuests(venueId: number) {
  const res = await fetch(`${API_BASE}/api/super-admin/venues/${venueId}/guests`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch guests");
  return res.json();
}
