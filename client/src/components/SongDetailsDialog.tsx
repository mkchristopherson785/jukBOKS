import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Music, Disc, Calendar, Clock, ExternalLink, Play, Pause, Loader2, AlertCircle } from "lucide-react";
import { fetchTrackDetails, type TrackDetails } from "../lib/api";

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

export function SongDetailsDialog({ trackId, fallback, onClose }: SongDetailsDialogProps) {
  const [details, setDetails] = useState<TrackDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);
    fetchTrackDetails(trackId)
      .then((data) => {
        if (!cancelled) setDetails(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load song details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

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

  if (!trackId) return null;

  const displayTitle = details?.title || fallback?.title || "Unknown Track";
  const displayArtist = details?.artist || fallback?.artist || "Unknown Artist";
  const displayAlbum = details?.album || fallback?.album;
  const displayCover = details?.albumCover || fallback?.albumCover;
  const displayExplicit = details?.isExplicit ?? fallback?.isExplicit ?? false;
  const previewUrl = details?.previewUrl || fallback?.previewUrl;

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
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-b from-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-details-title"
        data-testid="song-details-dialog"
      >
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
