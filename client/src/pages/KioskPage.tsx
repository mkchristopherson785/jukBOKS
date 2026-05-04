import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, ThumbsUp, Play, User, Radio, Volume2, Maximize, Minimize, Clock, Pause, Speaker, Headphones } from "lucide-react";
import { fetchVenue, fetchNowPlaying, fetchQueue, fetchQRCode, fetchNextAnnouncement, markAnnouncementPlayed, markSongFinished, fetchSonosStatus, sendKioskHeartbeat, fetchListeners } from "../lib/api";
import { MusicKitPlayer } from "../components/MusicKitPlayer";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

type DaySchedule = { startTime: string; endTime: string };
type DaySchedules = Record<string, DaySchedule>;

function isWithinSchedule(venue: any): { isActive: boolean; nextStart?: string; nextEnd?: string; todaySchedule?: DaySchedule } {
  if (!venue?.kioskScheduleEnabled) {
    return { isActive: true };
  }

  const now = new Date();
  const dayMap: { [key: number]: string } = {
    0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"
  };
  const dayOrder = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = dayMap[now.getDay()];
  const activeDays = (venue.kioskScheduleDays as string[]) || ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const daySchedules = (venue.kioskDaySchedules as DaySchedules) || {};

  // Get schedule for a specific day (use per-day if set, otherwise default)
  const getScheduleForDay = (day: string): DaySchedule => {
    if (daySchedules[day]) {
      return daySchedules[day];
    }
    return {
      startTime: venue.kioskStartTime || "12:00",
      endTime: venue.kioskEndTime || "21:00"
    };
  };

  const todaySchedule = getScheduleForDay(today);
  const { startTime, endTime } = todaySchedule;

  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const isOvernightSchedule = endMinutes <= startMinutes;

  if (activeDays.includes(today)) {
    if (isOvernightSchedule) {
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return { isActive: true, nextEnd: endTime, todaySchedule };
      }
    } else {
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return { isActive: true, nextEnd: endTime, todaySchedule };
      }
    }
  }

  if (isOvernightSchedule && currentMinutes < endMinutes) {
    const yesterday = dayMap[(now.getDay() + 6) % 7];
    if (activeDays.includes(yesterday)) {
      const yesterdaySchedule = getScheduleForDay(yesterday);
      return { isActive: true, nextEnd: yesterdaySchedule.endTime, todaySchedule: yesterdaySchedule };
    }
  }

  if (activeDays.includes(today) && currentMinutes < startMinutes) {
    return { isActive: false, nextStart: startTime, todaySchedule };
  }

  for (let i = 1; i <= 7; i++) {
    const nextDayIndex = (now.getDay() + i) % 7;
    const nextDay = dayOrder[nextDayIndex];
    if (activeDays.includes(nextDay)) {
      const nextDaySchedule = getScheduleForDay(nextDay);
      const dayName = nextDay.charAt(0).toUpperCase() + nextDay.slice(1);
      return { isActive: false, nextStart: `${dayName} ${nextDaySchedule.startTime}`, todaySchedule };
    }
  }

  return { isActive: false, nextStart: "No scheduled days", todaySchedule };
}

const API_BASE = "";

export default function KioskPage() {
  const { code } = useParams<{ code: string }>();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(window.location.search);
  const autostart = searchParams.get("autostart") === "true";
  const layout = searchParams.get("layout") || "default";
  const isSquareLayout = layout === "square";
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [lastPlayedSong, setLastPlayedSong] = useState<{ title: string; artist: string; albumCover?: string } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isStarted, setIsStarted] = useState(autostart);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isPlayingAnnouncement, setIsPlayingAnnouncement] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<{ id: number; name: string; audioUrl: string } | null>(null);
  const [announcementAudio, setAnnouncementAudio] = useState<HTMLAudioElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [togglePlayHandler, setTogglePlayHandler] = useState<(() => void) | null>(null);
  const [skipHandler, setSkipHandler] = useState<(() => void) | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<{ isActive: boolean; nextStart?: string; nextEnd?: string }>({ isActive: true });
  const [isSchedulePaused, setIsSchedulePaused] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [hasLock, setHasLock] = useState(true);
  const [lockedByDevice, setLockedByDevice] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Generate or retrieve persistent device ID
  const deviceId = useMemo(() => {
    const stored = localStorage.getItem("jukboks-device-id");
    if (stored) return stored;
    const newId = `kiosk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("jukboks-device-id", newId);
    return newId;
  }, []);
  
  // Get a friendly device name
  const deviceName = useMemo(() => {
    const ua = navigator.userAgent;
    if (/iPad/.test(ua)) return "iPad";
    if (/iPhone/.test(ua)) return "iPhone";
    if (/Macintosh/.test(ua)) return "Mac";
    if (/Windows/.test(ua)) return "Windows PC";
    if (/Android/.test(ua)) return "Android";
    if (/Raspberry Pi|Linux/.test(ua)) return "Raspberry Pi";
    return "Browser Kiosk";
  }, []);

  const { data: venue } = useQuery({
    queryKey: ["venue", code],
    queryFn: () => fetchVenue(code!),
    enabled: !!code,
  });

  useEffect(() => {
    if (!venue) return;

    const checkSchedule = () => {
      const status = isWithinSchedule(venue);
      setScheduleStatus(status);

      if (venue.kioskScheduleEnabled && !manualOverride) {
        if (status.isActive) {
          setIsStarted(prev => prev ? prev : true);
          setIsSchedulePaused(false);
        } else {
          setIsStarted(prev => {
            if (prev) setIsSchedulePaused(true);
            return prev;
          });
        }
      }

      if (status.isActive && manualOverride) {
        setManualOverride(false);
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 30000);
    return () => clearInterval(interval);
  }, [venue, manualOverride]);

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

  // Send heartbeat every 30 seconds when kiosk is running
  useEffect(() => {
    if (!code) return;

    const getPlaybackStatus = (): "idle" | "playing" | "paused" | "scheduled" => {
      if (!isStarted) return "idle";
      if (isSchedulePaused) return "scheduled";
      if (isPlaying) return "playing";
      return "paused";
    };

    const sendHeartbeat = async () => {
      try {
        const result = await sendKioskHeartbeat(code, {
          deviceId,
          deviceName,
          playbackStatus: getPlaybackStatus(),
        });
        setHasLock(result.hasLock);
        setLockedByDevice(result.lockedBy || null);
      } catch (error) {
        console.error("Failed to send kiosk heartbeat:", error);
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [code, isStarted, isSchedulePaused, isPlaying, deviceId, deviceName]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

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

  const { data: listenersData } = useQuery({
    queryKey: ["listeners", code],
    queryFn: () => fetchListeners(code!),
    enabled: !!code,
    refetchInterval: 15000,
  });

  const [songFade, setSongFade] = useState<"in" | "out" | "visible">("visible");
  const prevSongRef = useRef<string | null>(null);

  useEffect(() => {
    const currentId = currentSong?.trackId || nowPlaying?.trackId || null;
    if (currentId && currentId !== prevSongRef.current) {
      if (prevSongRef.current) {
        setSongFade("out");
        const timer = setTimeout(() => {
          setSongFade("in");
          prevSongRef.current = currentId;
          const timer2 = setTimeout(() => setSongFade("visible"), 500);
          return () => clearTimeout(timer2);
        }, 300);
        return () => clearTimeout(timer);
      } else {
        setSongFade("in");
        prevSongRef.current = currentId;
        const timer = setTimeout(() => setSongFade("visible"), 500);
        return () => clearTimeout(timer);
      }
    }
  }, [currentSong?.trackId, nowPlaying?.trackId]);

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
  
  const canAutoPlay = !isSchedulePaused && (scheduleStatus.isActive || manualOverride);

  // Pre-populate queue with backup songs when kiosk page first loads
  useEffect(() => {
    if (!code || !queue || autoPlayAttempts >= MAX_AUTO_PLAY_ATTEMPTS) return;
    if (!canAutoPlay) return;
    
    const playableItems = queue.items?.filter((item: any) => 
      (item.status === "approved" || item.status === "pending") && 
      (item.previewUrl || item.trackId)
    ) || [];
    
    // If queue is empty, trigger auto-play to populate it
    if (playableItems.length === 0 && !isAutoPlaying) {
      setAutoPlayAttempts(prev => prev + 1);
      triggerAutoPlay();
    }
  }, [code, queue, triggerAutoPlay, autoPlayAttempts, isAutoPlaying, canAutoPlay]);

  const playNextSong = useCallback(() => {
    if (isTransitioning || !queue?.items || !canAutoPlay) return;
    
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
  }, [queue?.items, isTransitioning, playNextMutation, triggerAutoPlay, canAutoPlay]);

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
        const isUrgent = result.urgent === true;

        const onAnnouncementFinished = async () => {
          await markAnnouncementPlayed(code, playedGroupId, playedAnnouncementId, isUrgent, isUrgent ? deviceId : undefined);
          setIsPlayingAnnouncement(false);
          setCurrentAnnouncement(null);
          setAnnouncementAudio(null);
          setIsTransitioning(false);
          refetchQueue();
        };

        const onAnnouncementError = () => {
          console.error("Error playing announcement");
          setIsPlayingAnnouncement(false);
          setCurrentAnnouncement(null);
          setAnnouncementAudio(null);
          setIsTransitioning(false);
          refetchQueue();
        };

        if (result.announcement.ttsText && !result.announcement.audioUrl) {
          if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
            const utterance = new SpeechSynthesisUtterance(result.announcement.ttsText);
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            utterance.onend = () => { onAnnouncementFinished(); };
            utterance.onerror = () => { onAnnouncementFinished(); };
            speechSynthesis.speak(utterance);
          } else {
            console.warn("TTS not supported on this device, skipping announcement");
            onAnnouncementFinished();
          }
        } else if (result.announcement.audioUrl) {
          const audio = new Audio(result.announcement.audioUrl);
          setAnnouncementAudio(audio);
          audio.onended = () => { onAnnouncementFinished(); };
          audio.onerror = () => { onAnnouncementError(); };
          audio.play().catch(() => { onAnnouncementError(); });
        } else {
          onAnnouncementError();
        }
        
        return true;
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

  useEffect(() => {
    if (isSchedulePaused && scheduleStatus.isActive) {
      setIsSchedulePaused(false);
    }
  }, [scheduleStatus.isActive, isSchedulePaused]);

  // Show lock warning when another device is controlling playback
  if (!hasLock && lockedByDevice && isStarted) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-6 sm:mb-8 flex justify-center">
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Speaker className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">Playback Locked</h1>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Another device is currently controlling playback for this venue.
          </p>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-4 sm:p-6 max-w-sm mx-auto">
            <p className="text-white font-medium mb-1">Active Device</p>
            <p className="text-amber-400 text-lg font-semibold">{lockedByDevice}</p>
            <p className="text-gray-500 text-sm mt-2">
              Close the kiosk on that device to take control here
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isSchedulePaused || (!isStarted && venue?.kioskScheduleEnabled && !scheduleStatus.isActive)) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-6 sm:mb-8 flex justify-center">
            {venue?.logoUrl ? (
              <img src={venue.logoUrl} alt="" className="h-16 sm:h-24 w-auto opacity-50" />
            ) : (
              <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center">
                <Pause className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
              </div>
            )}
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">{venue?.name || "Jukboks"}</h1>
          <div className="flex items-center justify-center gap-2 text-gray-400 mb-6 sm:mb-8">
            <Clock className="w-5 h-5" />
            <span>Outside Scheduled Hours</span>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-4 sm:p-6 max-w-sm mx-auto mb-6">
            <p className="text-white font-medium mb-2">Scheduled Hours</p>
            <p className="text-indigo-400 text-lg font-semibold">
              {venue?.kioskStartTime || "12:00"} - {venue?.kioskEndTime || "21:00"}
            </p>
            {scheduleStatus.nextStart && (
              <p className="text-gray-400 text-sm mt-2">
                Resumes {scheduleStatus.nextStart === "tomorrow" ? "tomorrow" : `at ${scheduleStatus.nextStart}`}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setManualOverride(true);
              setIsSchedulePaused(false);
              setIsStarted(true);
            }}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-full text-white font-medium flex items-center gap-2 mx-auto transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Anyway
          </button>
        </div>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
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
          {venue?.kioskScheduleEnabled && scheduleStatus.isActive && (
            <div className="flex items-center justify-center gap-2 text-green-400 text-sm mb-4">
              <Clock className="w-4 h-4" />
              <span>Scheduled until {scheduleStatus.nextEnd || venue?.kioskEndTime}</span>
            </div>
          )}
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

  if (isSquareLayout) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col relative overflow-hidden">
        <MusicKitPlayer
          trackId={currentSong?.trackId || null}
          previewUrl={displayPreview}
          onEnded={handleSongEnded}
          onSkip={handleSkip}
          hideControls
          onTogglePlay={(handler) => setTogglePlayHandler(() => handler)}
          onSkipHandler={(handler) => setSkipHandler(() => handler)}
          onPlayingChange={setIsPlaying}
          trackName={currentSong?.title}
          venueCode={code}
          sonosEnabled={false}
        />

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {isPlayingAnnouncement && currentAnnouncement ? (
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="w-40 h-40 rounded-2xl shadow-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
                  <Volume2 className="w-20 h-20 text-white/80 animate-pulse" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">{currentAnnouncement.name}</h2>
              <p className="text-lg text-gray-300">Announcement</p>
            </div>
          ) : (
            <div className="text-center w-full">
              {displayCover && (
                <div className="mb-4 flex justify-center">
                  <img 
                    src={displayCover} 
                    alt={displayTitle || "Album"} 
                    className="w-40 h-40 rounded-2xl shadow-2xl object-cover"
                  />
                </div>
              )}
              <h2 className="text-xl font-bold text-white mb-1 line-clamp-2 flex items-center justify-center gap-2 px-2">
                {displayTitle || "No song playing"}
                {displayExplicit && (
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-600 text-xs font-bold rounded text-gray-300 flex-shrink-0">
                    E
                  </span>
                )}
              </h2>
              <p className="text-base text-gray-300 line-clamp-1 px-2">{displayArtist || "Request a song"}</p>
            </div>
          )}
        </div>

        <div className="bg-black/40 backdrop-blur-lg border-t border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-white">Up Next</h3>
            {qrData?.qrCode && (
              <img src={qrData.qrCode} alt="Scan to join" className="w-16 h-16 rounded" />
            )}
          </div>
          <div className="space-y-1.5">
            {upNextItems.slice(0, 3).map((item: any, index: number) => (
              <div key={item.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5">
                <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-[10px] flex-shrink-0">
                  {index + 1}
                </div>
                {item.albumCover ? (
                  <img src={item.albumCover} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <Music2 className="w-3 h-3 text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate text-xs">{item.title}</p>
                  <p className="text-gray-400 text-[10px] truncate">{item.artist}</p>
                </div>
              </div>
            ))}
            {upNextItems.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-2">No songs in queue</p>
            )}
          </div>
        </div>

        <div className="absolute bottom-2 left-2">
          {venue?.logoUrl ? (
            <img src={venue.logoUrl} alt="" className="h-6 w-auto opacity-50" />
          ) : (
            <img src="/assets/logo-app.png" alt="Jukboks" className="h-6 w-6 rounded opacity-50" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col lg:flex-row relative">
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
              <div className={`transition-all duration-500 ease-in-out ${
                songFade === "out" ? "opacity-0 scale-95" : songFade === "in" ? "opacity-0 scale-105 animate-kiosk-fade-in" : "opacity-100 scale-100"
              }`}>
                {displayCover && (
                  <div className="mb-6 sm:mb-12 flex justify-center">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-2xl sm:rounded-3xl blur-3xl opacity-30" style={{ background: `url(${displayCover}) center/cover` }} />
                      <img 
                        src={displayCover} 
                        alt={displayTitle || "Album"} 
                        className="relative w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-2xl sm:rounded-3xl shadow-2xl object-cover"
                      />
                    </div>
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
              </div>

              <MusicKitPlayer
                trackId={currentSong?.trackId || null}
                previewUrl={displayPreview}
                onEnded={handleSongEnded}
                onSkip={handleSkip}
                hideControls
                onTogglePlay={(handler) => setTogglePlayHandler(() => handler)}
                onSkipHandler={(handler) => setSkipHandler(() => handler)}
                onPlayingChange={setIsPlaying}
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
          <div className="flex items-center gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-white">Up Next</h2>
            {listenersData?.count > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                <Headphones className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400 text-xs font-medium">{listenersData.count}</span>
              </div>
            )}
          </div>
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
