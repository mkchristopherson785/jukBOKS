import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Music, AlertCircle, ChevronDown, Play, Pause, Info } from "lucide-react";
import { useAppleMusic, type Track } from "../hooks/useAppleMusic";
import { cn } from "../lib/utils";
import { SongDetailsDialog } from "./SongDetailsDialog";

const HOLIDAY_KEYWORDS = [
  'christmas', 'xmas', 'santa', 'jingle', 'noel', 'holiday', 'winter wonderland',
  'rudolph', 'frosty', 'snowman', 'sleigh', 'mistletoe', 'hanukkah', 'dreidel',
  'kwanzaa', 'feliz navidad', 'silent night', 'holy night', 'deck the halls',
  'carol', 'merry', 'auld lang syne', 'new year'
];

function isHolidaySong(track: Track): boolean {
  const titleLower = track.title.toLowerCase();
  const artistLower = track.artist.toLowerCase();
  const albumLower = (track.album || '').toLowerCase();
  
  return HOLIDAY_KEYWORDS.some(keyword => 
    titleLower.includes(keyword) || 
    albumLower.includes(keyword) ||
    (keyword === 'christmas' && artistLower.includes(keyword))
  );
}

interface SongSearchProps {
  onSelect: (track: Track) => void;
  allowExplicit?: boolean;
  blockHolidayMusic?: boolean;
  queueTrackIds?: Set<string>;
  isSubmitting?: boolean;
  submitSuccess?: boolean;
  venueCode?: string;
}

export function SongSearch({ onSelect, allowExplicit = false, blockHolidayMusic = false, queueTrackIds }: SongSearchProps) {
  const [query, setQuery] = useState("");
  const { searchTracks, results, isSearching, clearResults, loadMore, hasMore, isLoadingMore } = useAppleMusic();
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [detailsTrack, setDetailsTrack] = useState<Track | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval>>();

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = undefined;
    }
    setPreviewingTrackId(null);
    setPreviewProgress(0);
  }, []);

  const togglePreview = useCallback((track: Track, e: React.MouseEvent) => {
    e.stopPropagation();

    if (previewingTrackId === track.id) {
      stopPreview();
      return;
    }

    stopPreview();

    if (!track.previewUrl) return;

    const audio = new Audio(track.previewUrl);
    audioRef.current = audio;
    setPreviewingTrackId(track.id);
    setPreviewProgress(0);

    audio.play().catch(() => {
      stopPreview();
    });

    progressIntervalRef.current = setInterval(() => {
      if (audio.duration && audio.currentTime) {
        setPreviewProgress((audio.currentTime / audio.duration) * 100);
      }
    }, 100);

    audio.onended = () => {
      stopPreview();
    };
  }, [previewingTrackId, stopPreview]);

  useEffect(() => {
    return () => stopPreview();
  }, [stopPreview]);

  useEffect(() => {
    stopPreview();
  }, [query, stopPreview]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchTracks(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchTracks]);

  const handleSelect = (track: Track) => {
    if (!allowExplicit && track.isExplicit) return;
    if (blockHolidayMusic && isHolidaySong(track)) return;
    if (queueTrackIds?.has(track.id)) return;
    stopPreview();
    onSelect(track);
    setQuery("");
    clearResults();
  };

  const isTrackBlocked = (track: Track) => {
    if (!allowExplicit && track.isExplicit) return true;
    if (blockHolidayMusic && isHolidaySong(track)) return true;
    return false;
  };

  const isInQueue = (track: Track) => {
    return queueTrackIds?.has(track.id) || false;
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a song..."
          className="w-full pl-12 pr-12 py-4 bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={() => {
              stopPreview();
              setQuery("");
              clearResults();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {(results.length > 0 || isSearching) && (
        <div className="absolute z-50 w-full mt-2 bg-gray-900/95 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl flex flex-col max-h-[60vh] sm:max-h-96">
          {isSearching ? (
            <div className="p-8 text-center text-gray-400">
              <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2" />
              Searching...
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                {results.map((track) => (
                  <div
                    key={track.id}
                    onClick={() => handleSelect(track)}
                    role="button"
                    tabIndex={isTrackBlocked(track) || isInQueue(track) ? -1 : 0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(track); } }}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 hover:bg-white/10 transition-colors text-left border-b border-white/10 cursor-pointer",
                      (isTrackBlocked(track) || isInQueue(track)) && "opacity-50 cursor-not-allowed pointer-events-none"
                    )}
                  >
                    <div className="relative w-14 h-14 flex-shrink-0 group/art">
                      {track.albumCover ? (
                        <img
                          src={track.albumCover}
                          alt={track.album}
                          className="w-14 h-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-700 flex items-center justify-center">
                          <Music className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                      {track.previewUrl && !isTrackBlocked(track) && !isInQueue(track) && (
                        <button
                          type="button"
                          onClick={(e) => togglePreview(track, e)}
                          aria-label={previewingTrackId === track.id ? `Stop preview of ${track.title}` : `Preview ${track.title}`}
                          className={cn(
                            "absolute inset-0 rounded-lg flex items-center justify-center transition-opacity",
                            previewingTrackId === track.id
                              ? "bg-black/60 opacity-100"
                              : "bg-black/50 opacity-0 group-hover/art:opacity-100 focus:opacity-100"
                          )}
                        >
                          {previewingTrackId === track.id ? (
                            <>
                              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(129,140,248,0.9)" strokeWidth="2"
                                  strokeDasharray={`${2 * Math.PI * 24}`}
                                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - previewProgress / 100)}`}
                                  strokeLinecap="round"
                                  className="transition-all duration-100"
                                />
                              </svg>
                              <Pause className="w-5 h-5 text-white relative z-10" />
                            </>
                          ) : (
                            <Play className="w-5 h-5 text-white fill-white" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium truncate">{track.title}</p>
                        {track.isExplicit && (
                          <span className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">E</span>
                        )}
                        {isInQueue(track) && (
                          <span className="px-2 py-0.5 text-xs bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30 whitespace-nowrap">In Queue</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm truncate">{track.artist}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        stopPreview();
                        setDetailsTrack(track);
                      }}
                      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 pointer-events-auto"
                      title="View song details"
                      aria-label={`View details for ${track.title}`}
                      data-testid={`button-search-info-${track.id}`}
                    >
                      <Info className="w-4 h-4" />
                    </button>
                    {isTrackBlocked(track) && (
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full py-3 text-center text-indigo-400 hover:text-indigo-300 bg-gray-800/90 border-t border-white/10 transition-colors flex items-center justify-center gap-2 rounded-b-2xl flex-shrink-0"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Load More
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <SongDetailsDialog
        trackId={detailsTrack?.id || null}
        fallback={detailsTrack ? {
          title: detailsTrack.title,
          artist: detailsTrack.artist,
          album: detailsTrack.album,
          albumCover: detailsTrack.albumCover,
          isExplicit: detailsTrack.isExplicit,
          previewUrl: detailsTrack.previewUrl,
        } : undefined}
        onClose={() => setDetailsTrack(null)}
        onRequest={(track) => onSelect(track as Track)}
        queuedTrackIds={queueTrackIds}
      />
    </div>
  );
}
