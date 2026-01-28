import { useEffect, useState, useCallback, useRef } from "react";
import { Play, Pause, SkipForward, Volume2, AlertCircle, Music } from "lucide-react";
import { useMusicKit } from "../hooks/useMusicKit";

interface MusicKitPlayerProps {
  trackId: string | null;
  onEnded?: () => void;
  onSkip?: () => void;
  previewUrl?: string;
}

export function MusicKitPlayer({ trackId, onEnded, onSkip, previewUrl }: MusicKitPlayerProps) {
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
  const currentlyPlayingTrackRef = useRef<string | null>(null);

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
    if (isConfigured && isAuthorized && trackId && !usePreview) {
      if (currentlyPlayingTrackRef.current !== trackId) {
        currentlyPlayingTrackRef.current = trackId;
        playSong(trackId);
      }
    }
  }, [isConfigured, isAuthorized, trackId, playSong, usePreview]);

  useEffect(() => {
    if (!trackId) {
      currentlyPlayingTrackRef.current = null;
    }
  }, [trackId]);

  const handleAuthorize = async () => {
    const success = await authorize();
    if (!success && previewUrl) {
      setUsePreview(true);
    }
  };

  const handleTogglePlay = useCallback(() => {
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
  }, [usePreview, previewAudio, previewPlaying, musicKit, isPlaying, pause, playSong, trackId]);

  const handleSkip = useCallback(() => {
    if (usePreview && previewAudio) {
      previewAudio.pause();
      setPreviewPlaying(false);
    } else {
      stop();
    }
    onSkip?.();
  }, [usePreview, previewAudio, stop, onSkip]);

  const handleFallbackToPreview = () => {
    if (previewUrl) {
      setUsePreview(true);
    }
  };

  if (!isConfigured) {
    return (
      <div className="flex items-center gap-2 text-white/60">
        <Music className="w-5 h-5 animate-pulse" />
        <span className="text-sm">Connecting to Apple Music...</span>
      </div>
    );
  }

  if (!isAuthorized && !usePreview) {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleAuthorize}
          className="px-6 py-3 bg-gradient-to-r from-pink-500 to-red-500 rounded-full text-white font-semibold flex items-center gap-2 hover:scale-105 transition-transform"
        >
          <Music className="w-5 h-5" />
          Connect Apple Music
        </button>
        {previewUrl && (
          <button
            onClick={handleFallbackToPreview}
            className="text-white/60 text-sm hover:text-white/80"
          >
            Or play 30-second previews
          </button>
        )}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>
    );
  }

  const currentlyPlaying = usePreview ? previewPlaying : isPlaying;

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
        <Volume2 className="w-4 h-4" />
        <span className="text-xs">
          {usePreview ? "Preview Mode" : "Apple Music"}
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
