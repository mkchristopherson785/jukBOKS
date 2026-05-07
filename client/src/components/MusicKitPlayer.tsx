import { useEffect, useState, useCallback, useRef } from "react";
import { Play, Pause, SkipForward, Volume2, AlertCircle, Music, Speaker } from "lucide-react";
import { useMusicKit } from "../hooks/useMusicKit";
import { sonosPlayTrack, sonosControl } from "../lib/api";

interface MusicKitPlayerProps {
  trackId: string | null;
  onEnded?: () => void;
  onSkip?: () => void;
  previewUrl?: string;
  hideControls?: boolean;
  onTogglePlay?: (handler: () => void) => void;
  onSkipHandler?: (handler: () => void) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  trackName?: string;
  venueCode?: string;
  sonosEnabled?: boolean;
}

export function MusicKitPlayer({ trackId, onEnded, onSkip, previewUrl, hideControls, onTogglePlay, onSkipHandler, onPlayingChange, trackName, venueCode, sonosEnabled }: MusicKitPlayerProps) {
  const {
    isConfigured,
    isAuthorized,
    isPlaying,
    error,
    authorize,
    playSong,
    pause,
    stop,
    releasePlayer,
    musicKit,
  } = useMusicKit();

  const [usePreview, setUsePreview] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [sonosPlaying, setSonosPlaying] = useState(false);
  const currentlyPlayingTrackRef = useRef<string | null>(null);
  const sonosTrackRef = useRef<string | null>(null);

  // Shared throttle + "did this track actually play" refs. Used by both the
  // MusicKit path (further down) and the preview-audio path here. See the long
  // comment on the MusicKit listener for full rationale on the skip-cascade
  // bug — short version: both paths can emit a fake `ended` immediately when
  // the underlying source fails to load, and without a single shared throttle
  // a cascade rips through 8-10 songs in seconds.
  const hasReachedPlayingRef = useRef(false);
  const playingStartedAtRef = useRef(0);
  const lastEndedAtRef = useRef(0);
  // A track must have actually played for at least this many ms before we
  // accept an `ended`/`completed` event. MusicKit briefly toggles `playing`
  // (sometimes for <100ms) before bailing on a region-locked or unloadable
  // track, which would defeat hasReachedPlayingRef alone. 3s is short enough
  // that real seeks/skips work, long enough to filter out token-race failures.
  const MIN_PLAY_DURATION_MS = 3000;

  const throttledOnEnded = useCallback(() => {
    const now = Date.now();
    if (now - lastEndedAtRef.current < 5000) {
      console.warn(
        `[kiosk] Suppressing onEnded — only ${now - lastEndedAtRef.current}ms since last skip. ` +
        `Possible cascade.`
      );
      return;
    }
    lastEndedAtRef.current = now;
    hasReachedPlayingRef.current = false;
    onEnded?.();
  }, [onEnded]);

  // Notify parent of playing state changes
  useEffect(() => {
    const currentlyPlaying = isPlaying || previewPlaying || sonosPlaying;
    onPlayingChange?.(currentlyPlaying);
  }, [isPlaying, previewPlaying, sonosPlaying, onPlayingChange]);

  useEffect(() => {
    if (previewUrl && usePreview) {
      const audio = new Audio(previewUrl);
      // Closure-scoped flags per audio instance — never use shared refs here,
      // because a stale `ended` from a previous Audio object must NOT see
      // flags set by a newer instance (would re-trigger the cascade).
      let startedAt = 0;
      let disposed = false;
      const onPlaying = () => {
        if (disposed) return;
        if (startedAt === 0) startedAt = Date.now();
      };
      const onAudioEnded = () => {
        if (disposed) return;
        setPreviewPlaying(false);
        if (startedAt === 0) {
          console.warn(
            `[kiosk] Preview 'ended' without ever 'playing'. Ignoring — URL likely failed: ${previewUrl}`
          );
          return;
        }
        const playedFor = Date.now() - startedAt;
        if (playedFor < MIN_PLAY_DURATION_MS) {
          console.warn(
            `[kiosk] Preview 'ended' after only ${playedFor}ms. Ignoring — likely failed to stream: ${previewUrl}`
          );
          return;
        }
        throttledOnEnded();
      };
      const onError = () => {
        if (disposed) return;
        console.warn(`[kiosk] Preview audio error, ignoring (no cascade): ${previewUrl}`);
        setPreviewPlaying(false);
      };
      audio.addEventListener("playing", onPlaying);
      audio.addEventListener("ended", onAudioEnded);
      audio.addEventListener("error", onError);
      setPreviewAudio(audio);
      audio.play()
        .then(() => { if (!disposed) setPreviewPlaying(true); })
        .catch((err) => {
          console.warn("Preview autoplay blocked, will need user interaction:", err.message);
        });
      return () => {
        disposed = true;
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("ended", onAudioEnded);
        audio.removeEventListener("error", onError);
        audio.pause();
        audio.src = "";
      };
    }
  }, [previewUrl, usePreview, trackId, throttledOnEnded]);
  
  // Auto-fallback to preview mode if MusicKit is configured but not authorized after a delay
  useEffect(() => {
    if (isConfigured && !isAuthorized && previewUrl && !usePreview && !sonosEnabled) {
      const timer = setTimeout(() => {
        console.log("Auto-falling back to preview mode (not authorized)");
        setUsePreview(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isConfigured, isAuthorized, previewUrl, usePreview, sonosEnabled]);

  // Skip-cascade bug: MusicKit can emit `completed`/`ended` state immediately
  // when a track fails to play (token timing race at startup, region-locked
  // song, removed track). Without guards, that fake "song ended" event
  // triggers onEnded → next song → which also fails → cascade through 8+
  // tracks in a few seconds before one finally sticks. Two layers:
  //   Layer 1: hasReachedPlayingRef — only honor `completed/ended` if the
  //     track actually entered `playing` state at some point. Resets per
  //     trackId so a real song-end fires correctly.
  //   Layer 2: 5s throttle inside throttledOnEnded — defense in depth.
  // Both refs are declared above (alongside the preview-path guards) so the
  // throttle is shared across MusicKit + preview + any future audio source.
  useEffect(() => {
    // Reset per-track playback state whenever trackId changes so a fresh
    // track starts with a clean slate.
    hasReachedPlayingRef.current = false;
    playingStartedAtRef.current = 0;
  }, [trackId]);

  useEffect(() => {
    if (!musicKit || !trackId || usePreview) return;

    const handleStateChange = (event: any) => {
      if (event.state === window.MusicKit.PlaybackStates.playing) {
        if (!hasReachedPlayingRef.current) {
          hasReachedPlayingRef.current = true;
          playingStartedAtRef.current = Date.now();
        }
      }
      if (
        event.state === window.MusicKit.PlaybackStates.completed ||
        event.state === window.MusicKit.PlaybackStates.ended
      ) {
        if (!hasReachedPlayingRef.current) {
          console.warn(
            `[kiosk] MusicKit reported ${event.state} for ${trackId} without ever reaching 'playing'. ` +
            `Ignoring — track likely failed to load (region-locked, removed, or token not yet applied).`
          );
          return;
        }
        const playedFor = Date.now() - playingStartedAtRef.current;
        if (playedFor < MIN_PLAY_DURATION_MS) {
          console.warn(
            `[kiosk] MusicKit reported ${event.state} for ${trackId} after only ${playedFor}ms of playback. ` +
            `Ignoring — track briefly toggled 'playing' then bailed (likely region-locked or unloadable).`
          );
          return;
        }
        throttledOnEnded();
      }
    };

    musicKit.addEventListener("playbackStateDidChange", handleStateChange);
    return () => {
      musicKit.removeEventListener("playbackStateDidChange", handleStateChange);
    };
  }, [musicKit, trackId, throttledOnEnded, usePreview]);

  useEffect(() => {
    if (sonosEnabled && venueCode && trackId && !usePreview) {
      if (sonosTrackRef.current !== trackId) {
        sonosTrackRef.current = trackId;
        // Play full Apple Music track on Sonos (requires Apple Music linked to Sonos)
        sonosPlayTrack(venueCode, trackId, trackName || "Unknown Track")
          .then(() => setSonosPlaying(true))
          .catch((err) => {
            console.error("Sonos playback failed:", err);
            setSonosPlaying(false);
          });
      }
      return;
    }
    
    if (isConfigured && isAuthorized && trackId && !usePreview && !sonosEnabled) {
      if (currentlyPlayingTrackRef.current !== trackId) {
        currentlyPlayingTrackRef.current = trackId;
        playSong(trackId);
      }
    }
  }, [isConfigured, isAuthorized, trackId, playSong, usePreview, sonosEnabled, venueCode, previewUrl, trackName]);

  useEffect(() => {
    if (!trackId) {
      currentlyPlayingTrackRef.current = null;
      sonosTrackRef.current = null;
      // Between songs: release MusicKit's internal player references so the
      // prior song's audio buffers + nowPlayingItem + queue items can be GC'd
      // before the next song's setQueue() allocates new ones. Defensive — all
      // failures are swallowed inside releasePlayer so playback never breaks.
      // Skip in Sonos/preview modes which don't use MusicKit's full player.
      if (!usePreview && !sonosEnabled) {
        releasePlayer();
      }
    }
  }, [trackId, usePreview, sonosEnabled, releasePlayer]);

  const handleAuthorize = async () => {
    const success = await authorize();
    if (!success && previewUrl) {
      setUsePreview(true);
    }
  };

  const handleTogglePlay = useCallback(() => {
    if (sonosEnabled && venueCode) {
      if (sonosPlaying) {
        sonosControl(venueCode, 'pause').then(() => setSonosPlaying(false)).catch(console.error);
      } else {
        sonosControl(venueCode, 'play').then(() => setSonosPlaying(true)).catch(console.error);
      }
      return;
    }
    
    if (usePreview && previewAudio) {
      if (previewPlaying) {
        previewAudio.pause();
        setPreviewPlaying(false);
      } else {
        previewAudio.play();
        setPreviewPlaying(true);
      }
    } else if (musicKit) {
      if (isPlaying) {
        pause();
      } else if (trackId) {
        playSong(trackId);
      }
    }
  }, [usePreview, previewAudio, previewPlaying, musicKit, isPlaying, pause, playSong, trackId, sonosEnabled, venueCode, sonosPlaying]);

  const handleSkip = useCallback(() => {
    if (sonosEnabled && venueCode) {
      sonosControl(venueCode, 'skipToNextTrack').then(() => setSonosPlaying(false)).catch(console.error);
      onSkip?.();
      return;
    }
    
    if (usePreview && previewAudio) {
      previewAudio.pause();
      setPreviewPlaying(false);
    } else {
      stop();
    }
    onSkip?.();
  }, [usePreview, previewAudio, stop, onSkip, sonosEnabled, venueCode]);

  useEffect(() => {
    onTogglePlay?.(handleTogglePlay);
  }, [onTogglePlay, handleTogglePlay]);

  useEffect(() => {
    onSkipHandler?.(handleSkip);
  }, [onSkipHandler, handleSkip]);

  const handleFallbackToPreview = () => {
    if (previewUrl) {
      setUsePreview(true);
    }
  };

  if (!isConfigured && !error) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-white/60">
          <Music className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Connecting to Apple Music...</span>
        </div>
      </div>
    );
  }

  if (error && !usePreview) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
        <button
          onClick={handleAuthorize}
          className="px-4 py-2 bg-pink-500/80 hover:bg-pink-500 rounded-lg text-white text-sm"
        >
          Reauthorize Apple Music
        </button>
      </div>
    );
  }

  if (!isAuthorized && !usePreview && !sonosEnabled) {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleAuthorize}
          className="px-6 py-3 bg-gradient-to-r from-pink-500 to-red-500 rounded-full text-white font-semibold flex items-center gap-2 hover:scale-105 transition-transform"
        >
          <Music className="w-5 h-5" />
          Connect Apple Music
        </button>
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>
    );
  }

  const currentlyPlaying = sonosEnabled ? sonosPlaying : (usePreview ? previewPlaying : isPlaying);

  if (hideControls) {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleTogglePlay}
        className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        {currentlyPlaying ? (
          <Pause className="w-6 h-6 text-white" />
        ) : (
          <Play className="w-6 h-6 text-white ml-1" />
        )}
      </button>
      <button
        onClick={handleSkip}
        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <SkipForward className="w-5 h-5 text-white" />
      </button>
      <div className="flex items-center gap-2 text-white/60">
        {sonosEnabled ? <Speaker className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        <span className="text-xs">
          {sonosEnabled ? "Sonos" : (usePreview ? "Preview Mode" : "Apple Music")}
        </span>
      </div>
      {error && (
        <div className="flex items-center gap-1 text-red-400 text-xs">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}
    </div>
  );
}
