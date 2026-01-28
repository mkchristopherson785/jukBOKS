import { ThumbsUp, ThumbsDown, Music, User } from "lucide-react";
import { cn } from "../lib/utils";

interface QueueItem {
  id: number;
  trackId: string;
  title: string;
  artist: string;
  albumCover?: string;
  requesterName?: string;
  isAutoPlay: boolean;
  upvotes: number;
  downvotes: number;
  netVotes: number;
  status: string;
}

interface QueueListProps {
  items: QueueItem[];
  onVote?: (requestId: number, voteType: "up" | "down") => void;
  userVotes?: Map<number, "up" | "down">;
}

export function QueueList({ items, onVote, userVotes = new Map() }: QueueListProps) {
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
    <div className="space-y-3">
      {items.map((item, index) => {
        const userVote = userVotes.get(item.id);
        
        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-4 p-4 bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 transition-all hover:bg-white/10",
              index === 0 && "ring-2 ring-indigo-500/50"
            )}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-sm">
              {index + 1}
            </div>

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

            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{item.title}</p>
              <p className="text-gray-400 text-sm truncate">{item.artist}</p>
              {item.requesterName && (
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                  <User className="w-3 h-3" />
                  {item.requesterName}
                </div>
              )}
            </div>

            {onVote && (
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
  );
}
