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
  return res.json();
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
