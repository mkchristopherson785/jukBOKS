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
  trackName?: string;
  venueCode?: string;
  sonosEnabled?: boolean;
}

export function MusicKitPlayer({ trackId, onEnded, onSkip, previewUrl, hideControls, onTogglePlay, onSkipHandler, trackName, venueCode, sonosEnabled }: MusicKitPlayerProps) {
  const {
    isConfigured,
    isAuthorized,
    isPlaying,
    error,
    authorize,
    playSong,
    pause,
    stop,
    musicKit,
  } = useMusicKit();

  const [usePreview, setUsePreview] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [sonosPlaying, setSonosPlaying] = useState(false);
  const currentlyPlayingTrackRef = useRef<string | null>(null);
  const sonosTrackRef = useRef<string | null>(null);

  useEffect(() => {
    if (previewUrl && usePreview) {
      const audio = new Audio(previewUrl);
      audio.addEventListener("ended", () => {
        setPreviewPlaying(false);
        onEnded?.();
      });
      setPreviewAudio(audio);
      audio.play().then(() => setPreviewPlaying(true)).catch(console.error);
      return () => {
        audio.pause();
        audio.src = "";
      };
    }
  }, [previewUrl, usePreview, onEnded]);

  useEffect(() => {
    if (!musicKit || !trackId || usePreview) return;

    const handleStateChange = (event: any) => {
      if (
        event.state === window.MusicKit.PlaybackStates.completed ||
        event.state === window.MusicKit.PlaybackStates.ended
      ) {
        onEnded?.();
      }
    };

    musicKit.addEventListener("playbackStateDidChange", handleStateChange);
    return () => {
      musicKit.removeEventListener("playbackStateDidChange", handleStateChange);
    };
  }, [musicKit, trackId, onEnded, usePreview]);

  useEffect(() => {
    if (sonosEnabled && venueCode && trackId && !usePreview) {
      if (sonosTrackRef.current !== trackId) {
        sonosTrackRef.current = trackId;
        if (previewUrl) {
          sonosPlayTrack(venueCode, previewUrl, trackName || "Unknown Track")
            .then(() => setSonosPlaying(true))
            .catch((err) => {
              console.error("Sonos playback failed:", err);
              setSonosPlaying(false);
            });
        } else {
          console.warn("No preview URL available for Sonos playback");
          setSonosPlaying(false);
        }
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
    }
  }, [trackId]);

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
