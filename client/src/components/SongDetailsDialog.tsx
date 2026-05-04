import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Music, Disc, Calendar, Clock, ExternalLink, Play, Pause, Loader2, AlertCircle, Sparkles, ChevronLeft, Plus, Check } from "lucide-react";
import { fetchTrackDetails, fetchSimilarTracks, type TrackDetails, type TrackSummary } from "../lib/api";

interface SongDetailsDialogProps {
  trackId: string | null;
  fallback?: {
    title?: string;
    artist?: string;
    album?: string;
    albumCover?: string;
    isExplicit?: boolean;
    previewUrl?: string;
  };
  onClose: () => void;
  /** Optional: called when the user taps "Add" on a similar song. Only shown when provided. */
  onRequest?: (track: {
    id: string;
    title: string;
    artist: string;
    album: string;
    albumCover: string;
    duration: number;
    isExplicit: boolean;
    previewUrl?: string;
  }) => void;
  /** Track IDs already in the queue — those rows show a "queued" state instead of "Add". */
  queuedTrackIds?: Set<string>;
}

function formatDuration(ms: number) {
  if (!ms || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDate(iso?: string) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return null;
  }
}

export function SongDetailsDialog({ trackId, fallback, onClose, onRequest, queuedTrackIds }: SongDetailsDialogProps) {
  const [justRequestedIds, setJustRequestedIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<TrackDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [similar, setSimilar] = useState<TrackSummary[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeFallback, setActiveFallback] = useState<SongDetailsDialogProps["fallback"]>(undefined);
  const [history, setHistory] = useState<Array<{ id: string; fallback: SongDetailsDialogProps["fallback"] }>>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setPreviewing(false);
    setPreviewProgress(0);
  }, []);

  // Sync prop -> active when the dialog (re)opens with a new trackId from outside.
  useEffect(() => {
    if (trackId) {
      setActiveTrackId(trackId);
      setActiveFallback(fallback);
      setHistory([]);
    } else {
      setActiveTrackId(null);
      setActiveFallback(undefined);
      setHistory([]);
    }
    // We intentionally don't depend on `fallback` to avoid re-resetting on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  useEffect(() => {
    if (!activeTrackId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);
    setSimilar([]);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    fetchTrackDetails(activeTrackId)
      .then((data) => {
        if (!cancelled) setDetails(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load song details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    setSimilarLoading(true);
    fetchSimilarTracks(activeTrackId, 8)
      .then((items) => {
        if (!cancelled) setSimilar(items);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      })
      .finally(() => {
        if (!cancelled) setSimilarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTrackId]);

  useEffect(() => {
    return () => stopPreview();
  }, [stopPreview]);

  useEffect(() => {
    if (!trackId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopPreview();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [trackId, onClose, stopPreview]);

  if (!trackId || !activeTrackId) return null;

  const displayTitle = details?.title || activeFallback?.title || "Unknown Track";
  const displayArtist = details?.artist || activeFallback?.artist || "Unknown Artist";
  const displayAlbum = details?.album || activeFallback?.album;
  const displayCover = details?.albumCover || activeFallback?.albumCover;
  const displayExplicit = details?.isExplicit ?? activeFallback?.isExplicit ?? false;
  const previewUrl = details?.previewUrl || activeFallback?.previewUrl;

  const handleRequestSimilar = (track: TrackSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRequest) return;
    if (queuedTrackIds?.has(track.trackId) || justRequestedIds.has(track.trackId)) return;
    onRequest({
      id: track.trackId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumCover: track.albumCover,
      duration: track.duration,
      isExplicit: track.isExplicit,
      previewUrl: track.previewUrl,
    });
    setJustRequestedIds((prev) => {
      const next = new Set(prev);
      next.add(track.trackId);
      return next;
    });
  };

  const drillIntoSimilar = (track: TrackSummary) => {
    stopPreview();
    setHistory((h) => [...h, { id: activeTrackId, fallback: activeFallback }]);
    setActiveFallback({
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumCover: track.albumCover,
      isExplicit: track.isExplicit,
      previewUrl: track.previewUrl,
    });
    setActiveTrackId(track.trackId);
  };

  const goBack = () => {
    stopPreview();
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setActiveFallback(prev.fallback);
      setActiveTrackId(prev.id);
      return h.slice(0, -1);
    });
  };

  const togglePreview = () => {
    if (previewing) {
      stopPreview();
      return;
    }
    if (!previewUrl) return;
    stopPreview();
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPreviewing(true);
    setPreviewProgress(0);
    audio.play().catch(() => stopPreview());
    progressIntervalRef.current = setInterval(() => {
      if (audio.duration && audio.currentTime) {
        setPreviewProgress((audio.currentTime / audio.duration) * 100);
      }
    }, 100);
    audio.onended = () => stopPreview();
  };

  const handleClose = () => {
    stopPreview();
    onClose();
  };

  const releaseDate = formatDate(details?.releaseDate);

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
      data-testid="song-details-overlay"
    >
      <div
        ref={scrollRef}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-b from-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-details-title"
        data-testid="song-details-dialog"
      >
        {history.length > 0 && (
          <button
            onClick={goBack}
            className="absolute top-3 left-3 z-10 px-3 py-2 rounded-full bg-black/40 hover:bg-black/60 text-gray-300 hover:text-white transition-colors flex items-center gap-1 text-xs font-medium"
            aria-label="Back to previous song"
            data-testid="button-back-song-details"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-gray-300 hover:text-white transition-colors"
          aria-label="Close"
          data-testid="button-close-song-details"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative aspect-square w-full bg-gray-800 group/cover">
          {displayCover ? (
            <img
              src={displayCover}
              alt={displayAlbum || displayTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-20 h-20 text-gray-600" />
            </div>
          )}

          {previewUrl && (
            <button
              onClick={togglePreview}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/cover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label={previewing ? "Stop preview" : "Play 30-second preview"}
              data-testid="button-toggle-preview-details"
            >
              <div className="relative w-20 h-20 flex items-center justify-center">
                {previewing && (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                    <circle
                      cx="40" cy="40" r="36" fill="none" stroke="rgb(129,140,248)" strokeWidth="3"
                      strokeDasharray={`${2 * Math.PI * 36}`}
                      strokeDashoffset={`${2 * Math.PI * 36 * (1 - previewProgress / 100)}`}
                      strokeLinecap="round"
                      className="transition-all duration-100"
                    />
                  </svg>
                )}
                <div className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-xl">
                  {previewing ? (
                    <Pause className="w-7 h-7 text-gray-900" />
                  ) : (
                    <Play className="w-7 h-7 text-gray-900 fill-gray-900 ml-0.5" />
                  )}
                </div>
              </div>
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-start gap-2">
              <h2
                id="song-details-title"
                className="text-xl font-bold text-white leading-tight flex-1"
                data-testid="text-song-title"
              >
                {displayTitle}
              </h2>
              {displayExplicit && (
                <span className="inline-flex items-center justify-center w-5 h-5 mt-1 bg-gray-700 text-[10px] font-bold rounded text-gray-200 flex-shrink-0">
                  E
                </span>
              )}
            </div>
            <p className="text-base text-gray-300 mt-1" data-testid="text-song-artist">
              {displayArtist}
            </p>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading details...
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-2 text-sm">
              {displayAlbum && (
                <div className="flex items-start gap-2 text-gray-300">
                  <Disc className="w-4 h-4 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-gray-500">Album: </span>
                    <span data-testid="text-song-album">{displayAlbum}</span>
                  </div>
                </div>
              )}

              {(details?.duration ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <span className="text-gray-500">Length: </span>
                    <span data-testid="text-song-duration">{formatDuration(details!.duration)}</span>
                  </div>
                </div>
              )}

              {releaseDate && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <span className="text-gray-500">Released: </span>
                    <span data-testid="text-song-release">{releaseDate}</span>
                  </div>
                </div>
              )}

              {details?.genre && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Music className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <span className="text-gray-500">Genre: </span>
                    <span data-testid="text-song-genre">{details.genre}</span>
                  </div>
                </div>
              )}

              {(details?.trackNumber || details?.discNumber) && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Disc className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <span className="text-gray-500">Track: </span>
                    <span>
                      {details.trackNumber ?? "?"}
                      {details.discNumber && details.discNumber > 1 ? ` (Disc ${details.discNumber})` : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {details?.appleMusicUrl && (
            <a
              href={details.appleMusicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-200 text-sm font-medium transition-colors"
              data-testid="link-apple-music"
            >
              <ExternalLink className="w-4 h-4" />
              View on Apple Music
            </a>
          )}

          <div className="pt-3 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">You might also like</h3>
            </div>
            {similarLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Finding similar songs...
              </div>
            ) : similar.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No similar songs found.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="list-similar-songs">
                {similar.map((track) => {
                  const alreadyQueued = queuedTrackIds?.has(track.trackId) || justRequestedIds.has(track.trackId);
                  return (
                    <li key={track.trackId} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => drillIntoSimilar(track)}
                        className="flex-1 min-w-0 flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors text-left"
                        data-testid={`button-similar-${track.trackId}`}
                      >
                        {track.albumCover ? (
                          <img
                            src={track.albumCover}
                            alt={track.album || track.title}
                            className="w-10 h-10 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                            <Music className="w-5 h-5 text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-white truncate">{track.title}</p>
                            {track.isExplicit && (
                              <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-gray-700 text-[8px] font-bold rounded text-gray-300 flex-shrink-0">
                                E
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">
                            {track.album || track.artist}
                            {track.releaseYear ? ` · ${track.releaseYear}` : ""}
                          </p>
                        </div>
                      </button>
                      {onRequest && (
                        <button
                          type="button"
                          onClick={(e) => handleRequestSimilar(track, e)}
                          disabled={alreadyQueued}
                          className={
                            alreadyQueued
                              ? "flex-shrink-0 w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center cursor-default"
                              : "flex-shrink-0 w-9 h-9 rounded-full bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 text-white flex items-center justify-center transition-colors"
                          }
                          aria-label={alreadyQueued ? "Already in queue" : `Add ${track.title} to queue`}
                          title={alreadyQueued ? "Already in queue" : "Add to queue"}
                          data-testid={`button-request-similar-${track.trackId}`}
                        >
                          {alreadyQueued ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {details?.trackId && (
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] text-gray-600 font-mono break-all" data-testid="text-track-id">
                Track ID: {details.trackId}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
