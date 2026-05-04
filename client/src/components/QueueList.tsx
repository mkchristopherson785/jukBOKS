import { useState } from "react";
import { ThumbsUp, ThumbsDown, Music, User, Radio, Check, X, Trash2, Info } from "lucide-react";
import { cn } from "../lib/utils";
import { GuestRankBadge } from "./GuestRank";
import { SongDetailsDialog } from "./SongDetailsDialog";

interface QueueItem {
  id: number;
  trackId: string;
  title: string;
  artist: string;
  albumCover?: string;
  requesterName?: string;
  requestedByGuestId?: number;
  isAutoPlay: boolean;
  isExplicit?: boolean;
  upvotes: number;
  downvotes: number;
  netVotes: number;
  status: string;
}

interface QueueListProps {
  items: QueueItem[];
  onVote?: (requestId: number, voteType: "up" | "down") => void;
  userVotes?: Map<number, "up" | "down">;
  currentGuestId?: number | null;
  isAdmin?: boolean;
  onApprove?: (requestId: number) => void;
  onReject?: (requestId: number) => void;
  onRemove?: (requestId: number) => void;
  guestRankings?: Record<string, number>;
}

export function QueueList({ items, onVote, userVotes = new Map(), currentGuestId, isAdmin, onApprove, onReject, onRemove, guestRankings = {} }: QueueListProps) {
  const [detailsTrackId, setDetailsTrackId] = useState<string | null>(null);
  const [detailsFallback, setDetailsFallback] = useState<{ title?: string; artist?: string; albumCover?: string; isExplicit?: boolean } | undefined>();

  const openDetails = (item: QueueItem) => {
    setDetailsFallback({
      title: item.title,
      artist: item.artist,
      albumCover: item.albumCover,
      isExplicit: item.isExplicit,
    });
    setDetailsTrackId(item.trackId);
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Music className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p className="text-lg">Queue is empty</p>
        <p className="text-sm mt-1">Search for a song to get started!</p>
      </div>
    );
  }

  return (
    <>
    <SongDetailsDialog
      trackId={detailsTrackId}
      fallback={detailsFallback}
      onClose={() => setDetailsTrackId(null)}
    />
    <div className="space-y-3">
      {items.map((item, index) => {
        const userVote = userVotes.get(item.id);
        const isYourSong = currentGuestId != null && item.requestedByGuestId === currentGuestId;
        
        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-4 p-4 bg-white/5 backdrop-blur-lg rounded-xl border transition-all hover:bg-white/10",
              index === 0 && "ring-2 ring-indigo-500/50",
              isYourSong ? "border-indigo-500/30" : "border-white/10",
              item.status === "pending" && isAdmin && "border-amber-500/30 bg-amber-500/5"
            )}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-sm">
              {index + 1}
            </div>

            <button
              type="button"
              onClick={() => openDetails(item)}
              className="flex-shrink-0 group/cover relative"
              aria-label={`View details for ${item.title}`}
              data-testid={`button-queue-cover-${item.id}`}
            >
              {item.albumCover ? (
                <img
                  src={item.albumCover}
                  alt={item.title}
                  className="w-14 h-14 rounded-lg object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-gray-700 flex items-center justify-center">
                  <Music className="w-6 h-6 text-gray-500" />
                </div>
              )}
              <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center">
                <Info className="w-5 h-5 text-white" />
              </div>
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate flex items-center gap-1.5">
                {item.title}
                {item.isExplicit && (
                  <span className="inline-flex items-center justify-center w-4 h-4 bg-gray-600 text-[10px] font-bold rounded text-gray-300">
                    E
                  </span>
                )}
              </p>
              <p className="text-gray-400 text-sm truncate">{item.artist}</p>
              <div className="flex items-center gap-2 mt-1">
                {item.isAutoPlay ? (
                  <div className="flex items-center gap-1 text-xs text-purple-400">
                    <Radio className="w-3 h-3" />
                    Auto-play
                  </div>
                ) : item.requesterName ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <User className="w-3 h-3" />
                    {item.requesterName}
                    <GuestRankBadge guestName={item.requesterName} rankings={guestRankings} size={12} />
                  </div>
                ) : null}
                {isYourSong && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                    Your song — #{index + 1}
                  </span>
                )}
                {item.status === "pending" && isAdmin && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 rounded-full">
                    Pending
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => openDetails(item)}
              className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              title="View song details"
              aria-label={`View details for ${item.title}`}
              data-testid={`button-queue-info-${item.id}`}
            >
              <Info className="w-4 h-4" />
            </button>

            {isAdmin && (
              <div className="flex items-center gap-1">
                {item.status === "pending" && onApprove && (
                  <button
                    onClick={() => onApprove(item.id)}
                    className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                    title="Approve"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                {item.status === "pending" && onReject && (
                  <button
                    onClick={() => onReject(item.id)}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Reject"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {onRemove && (
                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {onVote && !isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onVote(item.id, "up")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-full transition-all",
                    userVote === "up"
                      ? "bg-green-500 text-white"
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                  )}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span className="font-medium text-sm">{item.upvotes}</span>
                </button>
                <button
                  onClick={() => onVote(item.id, "down")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-full transition-all",
                    userVote === "down"
                      ? "bg-red-500 text-white"
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                  )}
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span className="font-medium text-sm">{item.downvotes}</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
