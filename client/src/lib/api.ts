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

export async function removeBackupPlaylist(venueId: number, playlistId: string) {
  const res = await fetch(`${API_BASE}/api/me/venues/${venueId}/backup-playlists/${playlistId}`, {
    method: "DELETE",
    credentials: "include",
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

export async function markAnnouncementPlayed(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/announcement-played`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function markSongFinished(venueCode: string) {
  const res = await fetch(`${API_BASE}/api/v1/venues/${venueCode}/song-finished`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}
