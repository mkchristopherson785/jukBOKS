export interface GuestRankInfo {
  level: number;
  name: string;
  color: string;
  hat: string | null;
  threshold: number;
}

export const RANK_THRESHOLDS = {
  CROWD_PLEASER: 10,
  VIBE_CURATOR: 30,
  BEAT_DROPPER: 75,
  HITMAKER: 150,
  JUKEBOX_HERO: 300,
} as const;

export function getGuestRank(totalUpvotes: number): GuestRankInfo {
  if (totalUpvotes >= RANK_THRESHOLDS.JUKEBOX_HERO)
    return { level: 6, name: "Jukebox Hero", color: "#fbbf24", hat: "crown", threshold: RANK_THRESHOLDS.JUKEBOX_HERO };
  if (totalUpvotes >= RANK_THRESHOLDS.HITMAKER)
    return { level: 5, name: "Hitmaker", color: "#a78bfa", hat: "tophat", threshold: RANK_THRESHOLDS.HITMAKER };
  if (totalUpvotes >= RANK_THRESHOLDS.BEAT_DROPPER)
    return { level: 4, name: "Beat Dropper", color: "#f472b6", hat: "backwards-cap", threshold: RANK_THRESHOLDS.BEAT_DROPPER };
  if (totalUpvotes >= RANK_THRESHOLDS.VIBE_CURATOR)
    return { level: 3, name: "Vibe Curator", color: "#34d399", hat: "beret", threshold: RANK_THRESHOLDS.VIBE_CURATOR };
  if (totalUpvotes >= RANK_THRESHOLDS.CROWD_PLEASER)
    return { level: 2, name: "Crowd Pleaser", color: "#60a5fa", hat: "party-hat", threshold: RANK_THRESHOLDS.CROWD_PLEASER };
  return { level: 1, name: "Wallflower", color: "#9ca3af", hat: null, threshold: 0 };
}

export function getNextRank(currentLevel: number): { name: string; threshold: number; currentMin: number } | null {
  const thresholds = [
    { level: 2, name: "Crowd Pleaser", threshold: RANK_THRESHOLDS.CROWD_PLEASER, currentMin: 0 },
    { level: 3, name: "Vibe Curator", threshold: RANK_THRESHOLDS.VIBE_CURATOR, currentMin: RANK_THRESHOLDS.CROWD_PLEASER },
    { level: 4, name: "Beat Dropper", threshold: RANK_THRESHOLDS.BEAT_DROPPER, currentMin: RANK_THRESHOLDS.VIBE_CURATOR },
    { level: 5, name: "Hitmaker", threshold: RANK_THRESHOLDS.HITMAKER, currentMin: RANK_THRESHOLDS.BEAT_DROPPER },
    { level: 6, name: "Jukebox Hero", threshold: RANK_THRESHOLDS.JUKEBOX_HERO, currentMin: RANK_THRESHOLDS.HITMAKER },
  ];
  return thresholds.find((t) => t.level === currentLevel + 1) || null;
}
