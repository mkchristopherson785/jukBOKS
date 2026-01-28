import { useState, useRef, useEffect } from "react";
import { Play, Pause, SkipForward, Volume2, VolumeX } from "lucide-react";

interface AudioPlayerProps {
  previewUrl: string | null;
  title: string | null;
  artist: string | null;
  albumCover: string | null;
  onEnded?: () => void;
  autoPlay?: boolean;
}

export function AudioPlayer({ 
  previewUrl, 
  title, 
  artist, 
  albumCover,
  onEnded,
  autoPlay = true 
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (audioRef.current && previewUrl) {
      audioRef.current.src = previewUrl;
      if (autoPlay) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [previewUrl, autoPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [onEnded]);

  const togglePlay = () => {
    if (!audioRef.current || !previewUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!previewUrl) {
    return (
      <div className="bg-gray-800/50 rounded-2xl p-8 text-center">
        <p className="text-gray-400 text-lg">No song playing</p>
        <p className="text-gray-500 text-sm mt-2">Request a song to get started!</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 rounded-2xl p-6 backdrop-blur-sm">
      <audio ref={audioRef} />
      
      <div className="flex items-center gap-6">
        {albumCover && (
          <img 
            src={albumCover} 
            alt={title || "Album cover"} 
            className="w-24 h-24 rounded-xl shadow-lg"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-white truncate">{title || "Unknown"}</h3>
          <p className="text-gray-300 truncate">{artist || "Unknown Artist"}</p>
          
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400 w-10">{formatTime(progress)}</span>
              <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-200"
                  style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-10">{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            className="p-3 rounded-full bg-gray-700/50 hover:bg-gray-600/50 transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-gray-300" />
            ) : (
              <Volume2 className="w-5 h-5 text-gray-300" />
            )}
          </button>
          
          <button
            onClick={togglePlay}
            className="p-4 rounded-full bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white" />
            ) : (
              <Play className="w-6 h-6 text-white ml-0.5" />
            )}
          </button>
        </div>
      </div>
      
      <p className="text-center text-gray-500 text-xs mt-4">
        Playing 30-second preview
      </p>
    </div>
  );
}
