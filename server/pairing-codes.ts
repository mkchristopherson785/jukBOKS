type PairingEntry = {
  venueId: number;
  venueCode: string;
  expiresAt: number;
};

const TTL_MS = 10 * 60 * 1000;
const codes = new Map<string, PairingEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes.entries()) {
    if (entry.expiresAt < now) codes.delete(code);
  }
}, 60 * 1000);

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Reuse window: if the venue already has an active code with more than this
// much time left, return that code instead of issuing a new one. Prevents an
// attacker from rotating the kiosk-displayed code by spamming the public
// pairing-code endpoint.
const REUSE_WINDOW_MS = 9 * 60 * 1000;

export function issuePairingCode(venueId: number, venueCode: string): { code: string; expiresAt: number } {
  const now = Date.now();
  for (const [code, entry] of codes.entries()) {
    if (entry.venueId === venueId) {
      if (entry.expiresAt - now > (TTL_MS - REUSE_WINDOW_MS)) {
        return { code, expiresAt: entry.expiresAt };
      }
      codes.delete(code);
    }
  }
  let code = generateCode();
  while (codes.has(code)) code = generateCode();
  const expiresAt = now + TTL_MS;
  codes.set(code, { venueId, venueCode, expiresAt });
  return { code, expiresAt };
}

export function consumePairingCode(code: string): PairingEntry | null {
  const entry = codes.get(code);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    codes.delete(code);
    return null;
  }
  codes.delete(code);
  return entry;
}

export function peekPairingCode(code: string): PairingEntry | null {
  const entry = codes.get(code);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}
