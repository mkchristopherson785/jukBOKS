import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, ThumbsUp, Play, User, Radio, Volume2, Maximize, Minimize } from "lucide-react";
import { fetchVenue, fetchNowPlaying, fetchQueue, fetchQRCode, fetchNextAnnouncement, markAnnouncementPlayed, markSongFinished, fetchSonosStatus } from "../lib/api";
import { MusicKitPlayer } from "../components/MusicKitPlayer";
import { useState, useEffect, useCallback } from "react";

const API_BASE = "";

export default function KioskPage() {
  const { code } = useParams<{ code: string }>();
  const queryClient = useQueryClient();
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [lastPlayedSong, setLastPlayedSong] = useState<{ title: string; artist: string; albumCover?: string } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isPlayingAnnouncement, setIsPlayingAnnouncement] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<{ id: number; name: string; audioUrl: string } | null>(null);
  const [announcementAudio, setAnnouncementAudio] = useState<HTMLAudioElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [togglePlayHandler, setTogglePlayHandler] = useState<(() => void) | null>(null);
  const [skipHandler, setSkipHandler] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayHandler?.();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayHandler]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const { data: venue } = useQuery({
    queryKey: ["venue", code],
    queryFn: () => fetchVenue(code!),
    enabled: !!code,
  });

  const { data: nowPlaying } = useQuery({
    queryKey: ["nowPlaying", code],
    queryFn: () => fetchNowPlaying(code!),
    enabled: !!code,
    refetchInterval: 5000,
  });

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["queue", code],
    queryFn: () => fetchQueue(code!),
    enabled: !!code,
    refetchInterval: 5000,
  });

  const { data: qrData } = useQuery({
    queryKey: ["qrcode", code],
    queryFn: () => fetchQRCode(code!),
    enabled: !!code,
    staleTime: 1000 * 60 * 60,
  });

  const { data: sonosStatus } = useQuery({
    queryKey: ["sonos-kiosk", code],
    queryFn: () => fetchSonosStatus(code!),
    enabled: !!code,
    retry: false,
  });

  const playNextMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await fetch(`${API_BASE}/api/v1/venues/${code}/play/${requestId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to play song");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", code] });
      queryClient.invalidateQueries({ queryKey: ["nowPlaying", code] });
    },
  });

  const markPlayedMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await fetch(`${API_BASE}/api/v1/venues/${code}/played/${requestId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to mark as played");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", code] });
      queryClient.invalidateQueries({ queryKey: ["nowPlaying", code] });
    },
  });

  const triggerAutoPlay = useCallback(async (): Promise<boolean> => {
    if (isAutoPlaying) return false;
    setIsAutoPlaying(true);
    try {
      console.log("Triggering auto-play for venue:", code);
      const res = await fetch(`${API_BASE}/api/v1/venues/${code}/auto-play`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Auto-play response:", data);
        await refetchQueue();
        return true;
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.warn("Auto-play failed:", res.status, errorData);
        return false;
      }
    } catch (error) {
      console.error("Auto-play error:", error);
      return false;
    } finally {
      setTimeout(() => setIsAutoPlaying(false), 3000);
    }
  }, [code, refetchQueue, isAutoPlaying]);

  // Track auto-play attempts for initial load
  const [autoPlayAttempts, setAutoPlayAttempts] = useState(0);
  const MAX_AUTO_PLAY_ATTEMPTS = 3;
  
  // Pre-populate queue with backup songs when kiosk page first loads
  useEffect(() => {
    if (!code || !queue || autoPlayAttempts >= MAX_AUTO_PLAY_ATTEMPTS) return;
    
    const playableItems = queue.items?.filter((item: any) => 
      (item.status === "approved" || item.status === "pending") && 
      (item.previewUrl || item.trackId)
    ) || [];
    
    // If queue is empty, trigger auto-play to populate it
    if (playableItems.length === 0 && !isAutoPlaying) {
      setAutoPlayAttempts(prev => prev + 1);
      triggerAutoPlay();
    }
  }, [code, queue, triggerAutoPlay, autoPlayAttempts, isAutoPlaying]);

  const playNextSong = useCallback(() => {
    if (isTransitioning || !queue?.items) return;
    
    const playableItems = queue.items.filter((item: any) => 
      (item.status === "approved" || item.status === "pending") && 
      (item.previewUrl || item.trackId)
    );
    
    playableItems.sort((a: any, b: any) => (b.netVotes || 0) - (a.netVotes || 0));
    
    if (playableItems.length > 0) {
      const nextSong = playableItems[0];
      setCurrentSong(nextSong);
      playNextMutation.mutate(nextSong.id);
    } else {
      // Queue is empty, try to get a song from backup playlists
      triggerAutoPlay();
    }
  }, [queue?.items, isTransitioning, playNextMutation, triggerAutoPlay]);

  useEffect(() => {
    if (!isStarted) return;
    if (!currentSong && !isTransitioning) {
      const playableItems = queue?.items?.filter((item: any) => 
        (item.status === "approved" || item.status === "pending") && 
        (item.previewUrl || item.trackId)
      ) || [];
      const hasPlayingSong = queue?.items?.some((item: any) => item.status === "playing");
      
      if (!hasPlayingSong) {
        if (playableItems.length > 0) {
          playNextSong();
        } else {
          // Queue is empty, trigger auto-play
          triggerAutoPlay();
        }
      }
    }
  }, [queue?.items, currentSong, isTransitioning, playNextSong, isStarted, triggerAutoPlay]);

  const checkAndPlayAnnouncement = useCallback(async (): Promise<boolean> => {
    if (!code || isPlayingAnnouncement) return false;
    
    try {
      // First, mark that a song finished (increments counter)
      await markSongFinished(code);
      
      // Check if an announcement should play
      const result = await fetchNextAnnouncement(code);
      
      if (result.shouldPlay && result.announcement) {
        setIsPlayingAnnouncement(true);
        setCurrentAnnouncement(result.announcement);
        const playedGroupId = result.groupId;
        const playedAnnouncementId = result.announcement.id;
        
        // Create and play the audio element
        const audio = new Audio(result.announcement.audioUrl);
        setAnnouncementAudio(audio);
        
        audio.onended = async () => {
          // Mark announcement as played with group context
          await markAnnouncementPlayed(code, playedGroupId, playedAnnouncementId);
          setIsPlayingAnnouncement(false);
          setCurrentAnnouncement(null);
          setAnnouncementAudio(null);
          // Continue to next song
          setIsTransitioning(false);
          refetchQueue();
        };
        
        audio.onerror = () => {
          console.error("Error playing announcement");
          setIsPlayingAnnouncement(false);
          setCurrentAnnouncement(null);
          setAnnouncementAudio(null);
          setIsTransitioning(false);
          refetchQueue();
        };
        
        audio.play().catch((err) => {
          console.error("Failed to play announcement:", err);
          setIsPlayingAnnouncement(false);
          setCurrentAnnouncement(null);
          setAnnouncementAudio(null);
          setIsTransitioning(false);
          refetchQueue();
        });
        
        return true; // Announcement is playing
      }
    } catch (error) {
      console.error("Error checking announcement:", error);
    }
    
    return false; // No announcement to play
  }, [code, isPlayingAnnouncement, refetchQueue]);

  const handleSongEnded = useCallback(async () => {
    if (currentSong) {
      setIsTransitioning(true);
      setLastPlayedSong({ title: currentSong.title, artist: currentSong.artist, albumCover: currentSong.albumCover });
      
      markPlayedMutation.mutate(currentSong.id, {
        onSettled: async () => {
          setCurrentSong(null);
          
          // Check if we should play an announcement
          const playingAnnouncement = await checkAndPlayAnnouncement();
          
          if (!playingAnnouncement) {
            // No announcement, continue to next song
            setIsTransitioning(false);
            refetchQueue();
          }
          // If announcement is playing, it will handle transitioning when it ends
        },
      });
    }
  }, [currentSong, markPlayedMutation, refetchQueue, checkAndPlayAnnouncement]);

  const handleSkip = useCallback(() => {
    if (currentSong) {
      setIsTransitioning(true);
      setLastPlayedSong({ title: currentSong.title, artist: currentSong.artist, albumCover: currentSong.albumCover });
      markPlayedMutation.mutate(currentSong.id, {
        onSettled: () => {
          setCurrentSong(null);
          setIsTransitioning(false);
          refetchQueue();
        },
      });
    }
  }, [currentSong, markPlayedMutation, refetchQueue]);

  const displayTitle = currentSong?.title || nowPlaying?.title || lastPlayedSong?.title;
  const displayArtist = currentSong?.artist || nowPlaying?.artist || lastPlayedSong?.artist;
  const displayCover = currentSong?.albumCover || nowPlaying?.albumCover || lastPlayedSong?.albumCover;
  const displayPreview = currentSong?.previewUrl;
  const displayExplicit = currentSong?.isExplicit || nowPlaying?.isExplicit;

  const upNextItems = queue?.items?.filter((item: any) => 
    item.id !== currentSong?.id && 
    item.status !== "played" && 
    item.status !== "playing"
  ).sort((a: any, b: any) => (b.netVotes || 0) - (a.netVotes || 0)).slice(0, 8) || [];

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-6 sm:mb-8 flex justify-center">
            {venue?.logoUrl ? (
              <img src={venue.logoUrl} alt="" className="h-16 sm:h-24 w-auto" />
            ) : (
              <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Music2 className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
              </div>
            )}
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">{venue?.name || "Jukboks"}</h1>
          <p className="text-gray-400 mb-6 sm:mb-8">Kiosk Mode</p>
          <button
            onClick={() => setIsStarted(true)}
            className="px-6 py-3 sm:px-8 sm:py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full text-white text-lg sm:text-xl font-semibold flex items-center gap-2 sm:gap-3 mx-auto hover:scale-105 transition-transform"
          >
            <Play className="w-5 h-5 sm:w-6 sm:h-6" />
            Start Kiosk
          </button>
          <p className="text-gray-500 text-sm mt-4 sm:mt-6">Tap to enable music playback</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex flex-col lg:flex-row relative">
      {!isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors z-10"
          title="Enter Fullscreen"
        >
          <Maximize className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </button>
      )}
      
      {/* Now Playing Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl">
          {isPlayingAnnouncement && currentAnnouncement ? (
            <>
              <div className="mb-6 sm:mb-12 flex justify-center">
                <div className="w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-2xl sm:rounded-3xl shadow-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
                  <Volume2 className="w-24 h-24 sm:w-36 sm:h-36 lg:w-48 lg:h-48 text-white/80 animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl sm:text-4xl lg:text-6xl font-bold text-white mb-2 sm:mb-4">{currentAnnouncement.name}</h2>
                <p className="text-lg sm:text-xl lg:text-2xl text-gray-300">Announcement</p>
              </div>
            </>
          ) : (
            <>
              {displayCover && (
                <div className="mb-6 sm:mb-12 flex justify-center">
                  <img 
                    src={displayCover} 
                    alt={displayTitle || "Album"} 
                    className="w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-2xl sm:rounded-3xl shadow-2xl object-cover"
                  />
                </div>
              )}
              
              <div className="text-center px-2">
                <h2 className="text-xl sm:text-4xl lg:text-6xl font-bold text-white mb-2 sm:mb-4 line-clamp-2 flex items-center justify-center gap-2 sm:gap-3">
                  {displayTitle || "No song playing"}
                  {displayExplicit && (
                    <span className="inline-flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 lg:w-9 lg:h-9 bg-gray-600 text-xs sm:text-sm lg:text-base font-bold rounded text-gray-300 flex-shrink-0">
                      E
                    </span>
                  )}
                </h2>
                <p className="text-base sm:text-2xl lg:text-3xl text-gray-300 line-clamp-1">{displayArtist || "Request a song to get started"}</p>
              </div>

              <MusicKitPlayer
                trackId={currentSong?.trackId || null}
                previewUrl={displayPreview}
                onEnded={handleSongEnded}
                onSkip={handleSkip}
                hideControls
                onTogglePlay={(handler) => setTogglePlayHandler(() => handler)}
                onSkipHandler={(handler) => setSkipHandler(() => handler)}
                trackName={currentSong?.title}
                venueCode={code}
                sonosEnabled={false}
              />
            </>
          )}
        </div>
      </div>

      {/* Logo in bottom left - hidden on mobile */}
      <div className="hidden sm:block absolute bottom-4 left-4">
        {venue?.logoUrl ? (
          <img src={venue.logoUrl} alt="" className="h-12 w-auto opacity-70" />
        ) : (
          <img src="/assets/logo-app.png" alt="Jukboks" className="h-12 w-12 rounded-xl opacity-70" />
        )}
      </div>

      {/* Queue Sidebar - becomes bottom section on mobile */}
      <div className="lg:w-96 bg-black/30 backdrop-blur-lg border-t lg:border-t-0 lg:border-l border-white/10 p-4 sm:p-6 flex flex-col max-h-[40vh] lg:max-h-none">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-white">Up Next</h2>
          {/* Mobile QR code - inline with header */}
          {qrData?.qrCode && (
            <div className="lg:hidden flex items-center gap-2">
              <img src={qrData.qrCode} alt="Scan to join" className="w-12 h-12" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3">
          {upNextItems.slice(0, 5).map((item: any, index: number) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl ${
                item.previewUrl ? "bg-white/5" : "bg-white/5 opacity-50"
              }`}
            >
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs sm:text-sm flex-shrink-0">
                {index + 1}
              </div>
              {item.albumCover ? (
                <img src={item.albumCover} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <Music2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate text-xs sm:text-sm flex items-center gap-1">
                  {item.title}
                  {item.isExplicit && (
                    <span className="inline-flex items-center justify-center w-3 h-3 sm:w-3.5 sm:h-3.5 bg-gray-600 text-[7px] sm:text-[8px] font-bold rounded text-gray-300 flex-shrink-0">
                      E
                    </span>
                  )}
                </p>
                <p className="text-gray-400 text-[10px] sm:text-xs truncate">{item.artist}</p>
                {item.isAutoPlay ? (
                  <p className="text-purple-400 text-[10px] sm:text-xs flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    Auto-play
                  </p>
                ) : item.requesterName ? (
                  <p className="text-gray-500 text-[10px] sm:text-xs flex items-center gap-1">
                    <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    {item.requesterName}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 text-indigo-400 text-xs sm:text-sm flex-shrink-0">
                <ThumbsUp className="w-3 h-3 sm:w-4 sm:h-4" />
                {item.netVotes || 0}
              </div>
            </div>
          ))}

          {upNextItems.length === 0 && (
            <div className="text-center text-gray-400 py-4 sm:py-8">
              <Music2 className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 opacity-50" />
              <p className="text-sm sm:text-base">No songs in queue</p>
            </div>
          )}
        </div>

        {/* Desktop QR code */}
        {qrData?.qrCode && (
          <div className="hidden lg:block mt-6 pt-6 border-t border-white/10">
            <div className="flex flex-col items-center">
              <img src={qrData.qrCode} alt="Scan to join" className="w-32 h-32" />
              <p className="text-white font-medium mt-2 text-center text-sm">
                Scan to request songs
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
