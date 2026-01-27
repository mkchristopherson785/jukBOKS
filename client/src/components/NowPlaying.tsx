import { Music } from "lucide-react";

interface NowPlayingProps {
  title?: string | null;
  artist?: string | null;
  albumCover?: string | null;
  compact?: boolean;
}

export function NowPlaying({ title, artist, albumCover, compact = false }: NowPlayingProps) {
  if (!title) {
    return (
      <div className={`flex items-center justify-center ${compact ? "py-6" : "py-16"}`}>
        <div className="text-center text-gray-400">
          <Music className={`mx-auto mb-2 ${compact ? "w-8 h-8" : "w-16 h-16"}`} />
          <p className={compact ? "text-sm" : "text-lg"}>Nothing playing</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-xl border border-indigo-500/30">
        {albumCover ? (
          <img src={albumCover} alt={title} className="w-12 h-12 rounded-lg object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-indigo-500/30 flex items-center justify-center">
            <Music className="w-6 h-6 text-indigo-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-indigo-300 font-medium">Now Playing</p>
          <p className="text-white font-semibold truncate">{title}</p>
          <p className="text-gray-400 text-sm truncate">{artist}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="relative inline-block mb-6">
        {albumCover ? (
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/30 rounded-full blur-3xl" />
            <img
              src={albumCover}
              alt={title}
              className="relative w-64 h-64 rounded-2xl object-cover shadow-2xl animate-pulse-glow"
            />
          </div>
        ) : (
          <div className="w-64 h-64 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-2xl">
            <Music className="w-24 h-24 text-white/50" />
          </div>
        )}
      </div>
      <p className="text-sm text-indigo-300 font-medium mb-2">Now Playing</p>
      <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
      <p className="text-xl text-gray-300">{artist}</p>
    </div>
  );
}
