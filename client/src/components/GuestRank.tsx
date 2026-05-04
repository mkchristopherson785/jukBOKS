import { getGuestRank, getNextRank } from "../../../shared/ranks";
export { getGuestRank } from "../../../shared/ranks";

function HatIcon({ hat, size = 14 }: { hat: string; size?: number }) {
  const s = size;
  switch (hat) {
    case "party-hat":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
          <polygon points="12,2 4,20 20,20" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1.5" />
          <circle cx="12" cy="2" r="2" fill="#fbbf24" />
          <line x1="7" y1="12" x2="17" y2="12" stroke="#fbbf24" strokeWidth="1" />
          <line x1="5.5" y1="16" x2="18.5" y2="16" stroke="#f472b6" strokeWidth="1" />
        </svg>
      );
    case "beret":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
          <ellipse cx="12" cy="16" rx="10" ry="4" fill="#34d399" stroke="#059669" strokeWidth="1.5" />
          <path d="M4 16 Q4 6 14 6 Q20 6 20 16" fill="#34d399" stroke="#059669" strokeWidth="1.5" />
          <circle cx="12" cy="5" r="2" fill="#059669" />
        </svg>
      );
    case "backwards-cap":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
          <path d="M3 16 Q3 8 12 8 Q21 8 21 16" fill="#f472b6" stroke="#db2777" strokeWidth="1.5" />
          <rect x="2" y="14" width="20" height="4" rx="2" fill="#db2777" />
          <rect x="16" y="12" width="6" height="3" rx="1" fill="#f472b6" stroke="#db2777" strokeWidth="1" />
        </svg>
      );
    case "tophat":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
          <rect x="7" y="4" width="10" height="12" rx="1" fill="#a78bfa" stroke="#7c3aed" strokeWidth="1.5" />
          <ellipse cx="12" cy="16" rx="11" ry="4" fill="#7c3aed" stroke="#6d28d9" strokeWidth="1.5" />
          <rect x="8" y="10" width="8" height="2" rx="1" fill="#fbbf24" />
        </svg>
      );
    case "crown":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
          <path d="M3 18 L3 10 L7 14 L12 6 L17 14 L21 10 L21 18 Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5" />
          <rect x="3" y="17" width="18" height="3" rx="1" fill="#f59e0b" />
          <circle cx="7" cy="12" r="1.5" fill="#ef4444" />
          <circle cx="12" cy="8" r="1.5" fill="#3b82f6" />
          <circle cx="17" cy="12" r="1.5" fill="#10b981" />
        </svg>
      );
    default:
      return null;
  }
}

interface GuestRankBadgeProps {
  guestName: string;
  rankings: Record<string, number>;
  showLabel?: boolean;
  size?: number;
}

function lookupUpvotes(guestName: string, rankings: Record<string, number>): number {
  if (rankings[guestName] !== undefined) return rankings[guestName];
  const lower = guestName.toLowerCase().trim();
  for (const [key, val] of Object.entries(rankings)) {
    if (key.toLowerCase().trim() === lower) return val;
  }
  return 0;
}

export function GuestRankBadge({ guestName, rankings, showLabel = false, size = 14 }: GuestRankBadgeProps) {
  const upvotes = lookupUpvotes(guestName, rankings);
  const rank = getGuestRank(upvotes);

  if (!rank.hat) {
    return showLabel ? (
      <span className="text-[10px] text-gray-500">{rank.name}</span>
    ) : null;
  }

  return (
    <span className="inline-flex items-center gap-1" title={`${rank.name} (${upvotes} upvotes)`}>
      <HatIcon hat={rank.hat} size={size} />
      {showLabel && (
        <span className="text-[10px] font-medium" style={{ color: rank.color }}>{rank.name}</span>
      )}
    </span>
  );
}

interface GuestRankCardProps {
  guestName: string;
  rankings: Record<string, number>;
}

export function GuestRankCard({ guestName, rankings }: GuestRankCardProps) {
  const upvotes = lookupUpvotes(guestName, rankings);
  const rank = getGuestRank(upvotes);
  const nextRank = getNextRank(rank.level);

  return (
    <div className="p-4 bg-white/5 backdrop-blur-lg rounded-xl border border-white/10">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: `${rank.color}30`, borderColor: rank.color, borderWidth: 2 }}
          >
            {guestName.charAt(0).toUpperCase()}
          </div>
          {rank.hat && (
            <div className="absolute -top-2 -right-1">
              <HatIcon hat={rank.hat} size={18} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">{guestName}</p>
          <p className="text-xs font-medium" style={{ color: rank.color }}>
            Lv.{rank.level} {rank.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-white font-bold text-lg">{upvotes}</p>
          <p className="text-gray-500 text-[10px]">upvotes</p>
        </div>
      </div>
      {nextRank && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span>Next: {nextRank.name}</span>
            <span>{nextRank.threshold - upvotes} more</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, ((upvotes - nextRank.currentMin) / (nextRank.threshold - nextRank.currentMin)) * 100)}%`,
                backgroundColor: rank.color,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

