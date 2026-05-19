import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, ThumbsUp, Play, User, Radio, Volume2, Maximize, Minimize, Clock, Pause, Speaker, Headphones } from "lucide-react";
import { fetchVenue, fetchNowPlaying, fetchQueue, fetchQRCode, fetchNextAnnouncement, markAnnouncementPlayed, markSongFinished, sendKioskHeartbeat, fetchListeners, releaseKioskLock, fetchAppleMusicToken, requestPairingCode } from "../lib/api";
import { MusicKitPlayer } from "../components/MusicKitPlayer";
import { useMusicKit } from "../hooks/useMusicKit";
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
  const urlLayout = searchParams.get("layout");
  const isDisplayOnly = searchParams.get("display") === "true";
  // Audio-only mode for headless Pi kiosks paired with a separate display
  // device (which loads ?display=true). Skips all heavy rendering — no album
  // art (no image decode buffers), no queue list, no QR code, no animations,
  // no logo. Just a black screen + the MusicKitPlayer audio engine + the
  // auto-play / song-end / announcement effects. Drops renderer memory
  // pressure substantially, which is the top cause of "Aw Snap" crashes on
  // long-running kiosks. Implies autostart so the headless Pi never shows a
  // tap-to-start screen it can't tap.
  const isAudioOnly = searchParams.get("audioOnly") === "1" || searchParams.get("audioOnly") === "true";
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [lastPlayedSong, setLastPlayedSong] = useState<{ title: string; artist: string; albumCover?: string } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isStarted, setIsStarted] = useState(autostart || isDisplayOnly || isAudioOnly);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isPlayingAnnouncement, setIsPlayingAnnouncement] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<{ id: number; name: string; audioUrl: string; imageUrl?: string | null } | null>(null);
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
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const tokenAppliedRef = useRef<string | null>(null);
  const { isConfigured: musicKitReady, applyMusicUserToken } = useMusicKit();
  
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
    refetchInterval: 30000,
  });

  // Server-side venue setting wins. URL ?layout= is only used as a fallback
  // before the venue query loads or when the venue has no saved layout.
  const serverLayout = (venue as any)?.kioskLayout as string | undefined;
  const effectiveLayout = serverLayout ?? urlLayout ?? "default";
  const isSquareLayout = effectiveLayout === "square";

  // Phase 2: when the venue's playbackBackend is 'apple_music_native', the
  // macOS audio agent drives Apple Music.app via AppleScript and the kiosk
  // page must NOT also instantiate MusicKitPlayer (double audio + duplicate
  // memory pressure). The kiosk still owns queue advancement — it just uses a
  // time-based setTimeout (duration seconds) instead of MusicKit's `ended`
  // event to fire handleSongEnded. Defaults to musickit_js until venue loads.
  const isNativeBackend = (venue as any)?.playbackBackend === "apple_music_native";

  // Apple Music kiosk pairing: fetch saved Music User Token from server.
  // If present, apply it to MusicKit silently so the headless kiosk can stream
  // full songs without anyone tapping a sign-in button. If absent, request a
  // 6-digit pairing code so the owner can connect from their phone at /pair.
  // Only request the token after we hold the kiosk lock (server enforces this).
  const { data: appleTokenData } = useQuery({
    queryKey: ["apple-music-token", code, deviceId],
    queryFn: () => fetchAppleMusicToken(code!, deviceId),
    // Native backend doesn't use MusicKit JS at all, so the kiosk's saved
    // Music User Token is irrelevant — skip the query and the pairing-code
    // flow below to avoid showing a pairing banner that does nothing.
    enabled: !!code && !isDisplayOnly && hasLock && !isNativeBackend,
    refetchInterval: 30000,
    retry: false,
  });

  useEffect(() => {
    const token = appleTokenData?.token;
    if (token && musicKitReady && tokenAppliedRef.current !== token) {
      applyMusicUserToken(token).then((ok) => {
        if (ok) {
          tokenAppliedRef.current = token;
          setIsPaired(true);
          setPairingCode(null);
        }
      });
    } else if (appleTokenData && !appleTokenData.token) {
      setIsPaired(false);
    }
  }, [appleTokenData, musicKitReady, applyMusicUserToken]);

  useEffect(() => {
    if (isDisplayOnly || !code || isPaired) return;
    if (isNativeBackend) return; // native backend doesn't need MusicKit pairing
    if (appleTokenData === undefined) return; // wait for first fetch
    if (appleTokenData?.token) return;
    if (pairingCode) return;
    requestPairingCode(code)
      .then((res) => setPairingCode(res.code))
      .catch((err) => console.warn("Failed to request pairing code:", err));
  }, [code, isDisplayOnly, appleTokenData, isPaired, pairingCode, isNativeBackend]);

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
    if (isDisplayOnly) return;
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
  }, [togglePlayHandler, isDisplayOnly]);

  // Shared guard: ensures only one watchdog (song-count, polite, or hard) can
  // call window.location.reload() per page lifetime. Prevents race conditions
  // where multiple effects fire in the same tick.
  const reloadTriggeredRef = useRef(false);
  const triggerReload = useCallback((reason: string) => {
    if (reloadTriggeredRef.current) return;
    reloadTriggeredRef.current = true;
    console.log(`[kiosk] ${reason}, reloading.`);
    window.location.reload();
  }, []);

  // (Song-count reload effect lives below, after nowPlaying is declared, so
  // its deps array can safely read nowPlaying?.trackId without TDZ errors.)

  // Memory-leak watchdog: reload the page every ?reload=N minutes (default 30).
  // Polite reload waits until no song is playing. Hard reload (?hardReload=N,
  // default 2x reload) fires regardless of playback state, so back-to-back
  // sets can't pin the page open forever and OOM the renderer ("Aw Snap").
  // Disable polite reloads with ?reload=0; disable hard reloads with ?hardReload=0.
  //
  // Implementation note: the interval MUST live for the entire page lifetime,
  // not be torn down on every song-start/song-end. We use refs for the latest
  // playback state so the long-lived interval can read fresh values without
  // resetting its `startedAt` clock. Earlier version had the interval in
  // [isPlaying, isPlayingAnnouncement]'s deps, which made hardReload never
  // actually fire on a busy night because uptime kept restarting per song.
  const playbackStateRef = useRef({ isPlaying: false, isPlayingAnnouncement: false });
  useEffect(() => {
    playbackStateRef.current = { isPlaying, isPlayingAnnouncement };
  }, [isPlaying, isPlayingAnnouncement]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const politeMin = params.get("reload") === "0"
      ? 0
      : Math.max(5, parseInt(params.get("reload") || "30", 10) || 30);
    const hardMin = params.get("hardReload") === "0"
      ? 0
      : Math.max(politeMin || 10, parseInt(params.get("hardReload") || "", 10) || (politeMin ? politeMin * 2 : 60));
    if (!politeMin && !hardMin) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const ageMs = Date.now() - startedAt;
      const ageMin = Math.round(ageMs / 60000);
      const { isPlaying: playing, isPlayingAnnouncement: announcing } = playbackStateRef.current;
      if (hardMin && ageMs >= hardMin * 60 * 1000) {
        triggerReload(`Page uptime ${ageMin}min hit HARD reload ceiling`);
        return;
      }
      if (politeMin && ageMs >= politeMin * 60 * 1000 && !playing && !announcing) {
        triggerReload(`Page uptime ${ageMin}min, between songs`);
      }
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [triggerReload]);

  // Memory-based watchdog: reload when JS heap exceeds ?memReloadMb=N (default
  // 0 = off). Self-correcting defense against MusicKit JS leaks: instead of
  // guessing the right time/song interval, we react to the ACTUAL pressure.
  // Polite by default (only between songs); ?memHardReloadMb=N forces a
  // reload mid-song if the heap blows past that ceiling. Uses Chromium's
  // non-standard performance.memory API (kiosk runs Chromium, so it's safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const perfMem = (performance as any).memory;
    if (!perfMem) return; // Non-Chromium browser, skip silently.
    const params = new URLSearchParams(window.location.search);
    const politeMb = parseInt(params.get("memReloadMb") || "0", 10) || 0;
    const hardMb = parseInt(params.get("memHardReloadMb") || "0", 10) || 0;
    if (!politeMb && !hardMb) return;
    const interval = setInterval(() => {
      const heapMb = Math.round((perfMem.usedJSHeapSize || 0) / (1024 * 1024));
      const { isPlaying: playing, isPlayingAnnouncement: announcing } = playbackStateRef.current;
      if (hardMb && heapMb >= hardMb) {
        triggerReload(`JS heap ${heapMb}MB hit HARD memory ceiling ${hardMb}MB`);
        return;
      }
      if (politeMb && heapMb >= politeMb && !playing && !announcing) {
        triggerReload(`JS heap ${heapMb}MB exceeded ${politeMb}MB, between songs`);
      }
    }, 15 * 1000);
    return () => clearInterval(interval);
  }, [triggerReload]);

  // Send heartbeat every 30 seconds when kiosk is running
  useEffect(() => {
    if (!code || isDisplayOnly) return;

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

  // 8s instead of 5s: 38% fewer requests with no UX change. The kiosk reacts
  // to song-end via MusicKit events anyway; this poll just covers admin edits
  // (skip/clear/approve) and new requests, where 8s lag is imperceptible.
  const { data: nowPlaying } = useQuery({
    queryKey: ["nowPlaying", code],
    queryFn: () => fetchNowPlaying(code!),
    enabled: !!code,
    refetchInterval: 8000,
  });

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["queue", code],
    queryFn: () => fetchQueue(code!),
    enabled: !!code,
    refetchInterval: 8000,
  });

  // Song-count reload: after every ?songsPerReload=N song changes, reload the
  // page. Fires naturally between songs (when the trackId changes), so it
  // never cuts off a song. Default 0 = off; opt in via URL param.
  // Placed AFTER nowPlaying is declared so the deps array can read its trackId
  // without hitting a temporal dead zone (caused a render crash earlier).
  const songCountRef = useRef(0);
  const songReloadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const n = parseInt(params.get("songsPerReload") || "0", 10) || 0;
    if (n <= 0) return;
    const currentId = currentSong?.trackId || nowPlaying?.trackId || null;
    if (!currentId || currentId === songReloadIdRef.current) return;
    songReloadIdRef.current = currentId;
    songCountRef.current += 1;
    if (songCountRef.current >= n) {
      triggerReload(`Played ${n} songs`);
    }
  }, [currentSong?.trackId, nowPlaying?.trackId, triggerReload]);

  const { data: qrData } = useQuery({
    queryKey: ["qrcode", code],
    queryFn: () => fetchQRCode(code!),
    enabled: !!code,
    staleTime: 1000 * 60 * 60,
    // QR code for a venue never changes during a session — disable the
    // global 5s refetch default to cut ~12 wasted requests/min on the kiosk.
    refetchInterval: false,
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

  // Synchronous re-entry lock for auto-play. Three different effects can call
  // triggerAutoPlay (initial load, "no current song" watcher, and playNextSong
  // when queue is empty). React state (isAutoPlaying) updates async, so all
  // three could fire in the same tick before the state propagates — each one
  // races in, hits POST /auto-play, and the server adds a backup song. Net
  // effect: 8+ songs piled into the queue before any actually plays. This ref
  // flips synchronously so the second caller bails immediately. Same pattern
  // already used by urgentPlaybackLockRef.
  const autoPlayLockRef = useRef(false);

  const triggerAutoPlay = useCallback(async (): Promise<boolean> => {
    if (autoPlayLockRef.current) return false;
    autoPlayLockRef.current = true;
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
      // 3s cooldown matches the existing isAutoPlaying delay — gives the queue
      // refetch + render cycle time to complete before another auto-play can fire.
      setTimeout(() => {
        autoPlayLockRef.current = false;
        setIsAutoPlaying(false);
      }, 3000);
    }
  }, [code, refetchQueue]);

  // Track auto-play attempts for initial load
  const [autoPlayAttempts, setAutoPlayAttempts] = useState(0);
  const MAX_AUTO_PLAY_ATTEMPTS = 3;
  
  const canAutoPlay = !isSchedulePaused && (scheduleStatus.isActive || manualOverride);

  // Pre-populate queue with backup songs when kiosk page first loads
  useEffect(() => {
    if (isDisplayOnly) return;
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
    if (isDisplayOnly || isTransitioning || !queue?.items || !canAutoPlay) return;
    
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
    if (!isStarted || isDisplayOnly) return;
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

  // Synchronous re-entry lock for urgent playback. The React state
  // `isPlayingAnnouncement` can lag behind multiple polling ticks (the 5s
  // interval can fire again before React has flushed the state update from
  // the previous call), which would cause the same urgent alert to play
  // twice. This ref flips synchronously and is checked first.
  const urgentPlaybackLockRef = useRef(false);

  const playUrgentAnnouncement = useCallback(async (result: any): Promise<boolean> => {
    if (!code || isPlayingAnnouncement || urgentPlaybackLockRef.current) return false;
    urgentPlaybackLockRef.current = true;

    setIsPlayingAnnouncement(true);
    setCurrentAnnouncement(result.announcement);

    if (skipHandler) {
      skipHandler();
    }
    setCurrentSong(null);

    const onAnnouncementFinished = async () => {
      try {
        await markAnnouncementPlayed(code, undefined, result.announcement.id, true, deviceId);
      } catch {}
      urgentPlaybackLockRef.current = false;
      setIsPlayingAnnouncement(false);
      setCurrentAnnouncement(null);
      setAnnouncementAudio(null);
      setIsTransitioning(false);
      refetchQueue();
    };

    const onAnnouncementError = () => {
      console.error("Error playing urgent announcement");
      urgentPlaybackLockRef.current = false;
      setIsPlayingAnnouncement(false);
      setCurrentAnnouncement(null);
      setAnnouncementAudio(null);
      setIsTransitioning(false);
      refetchQueue();
    };

    let playCount = 0;
    const totalPlays = 2;

    const playTts = () => {
      if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
        const utterance = new SpeechSynthesisUtterance(result.announcement.ttsText);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onend = () => {
          playCount++;
          if (playCount < totalPlays) {
            setTimeout(playTts, 1500);
          } else {
            onAnnouncementFinished();
          }
        };
        utterance.onerror = () => { onAnnouncementFinished(); };
        speechSynthesis.speak(utterance);
      } else {
        console.warn("TTS not supported, skipping urgent announcement");
        onAnnouncementFinished();
      }
    };

    const playAudioFile = () => {
      const audio = new Audio(result.announcement.audioUrl);
      setAnnouncementAudio(audio);
      audio.onended = () => {
        playCount++;
        if (playCount < totalPlays) {
          setTimeout(playAudioFile, 1500);
        } else {
          onAnnouncementFinished();
        }
      };
      audio.onerror = () => { onAnnouncementError(); };
      audio.play().catch(() => { onAnnouncementError(); });
    };

    if (result.announcement.ttsText && !result.announcement.audioUrl) {
      playTts();
    } else if (result.announcement.audioUrl) {
      playAudioFile();
    } else {
      onAnnouncementError();
    }

    return true;
  }, [code, isPlayingAnnouncement, skipHandler, deviceId, refetchQueue]);

  // Hold playUrgentAnnouncement in a ref so the polling effect below can
  // depend only on stable values. Without this, the effect was tearing down
  // and re-creating its 5s interval every time `skipHandler` (a dep of
  // `playUrgentAnnouncement`) got a new identity from MusicKitPlayer
  // re-rendering — which could happen faster than 5s, meaning the interval
  // never actually fired and urgent announcements were never picked up.
  const playUrgentAnnouncementRef = useRef(playUrgentAnnouncement);
  useEffect(() => {
    playUrgentAnnouncementRef.current = playUrgentAnnouncement;
  }, [playUrgentAnnouncement]);

  useEffect(() => {
    if (!code || !isStarted || isPlayingAnnouncement || isDisplayOnly) return;

    let cancelled = false;
    const checkUrgent = async () => {
      try {
        const result = await fetchNextAnnouncement(code);
        if (cancelled) return;
        if (result.shouldPlay && result.urgent && result.announcement) {
          playUrgentAnnouncementRef.current(result);
        }
      } catch (error) {
        // Silent fail for urgent poll
      }
    };

    // Fire one check immediately on (re)mount so we don't wait 5s — important
    // for the case where the user just pressed Start and an urgent alert was
    // already pending.
    checkUrgent();
    const interval = setInterval(checkUrgent, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [code, isStarted, isPlayingAnnouncement, isDisplayOnly]);

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

  // Synchronous re-entry lock for song-end. Defense-in-depth at the
  // orchestrator level — even if MusicKitPlayer's throttle is somehow defeated
  // (e.g. component remount, multiple instances mounting both layouts at once,
  // an unanticipated MusicKit event), this lock guarantees we never advance
  // the queue more than once per ~5s. Mirrors the autoPlayLockRef +
  // urgentPlaybackLockRef pattern. setIsTransitioning is async (React state),
  // so it cannot be relied on for synchronous gating.
  const songEndedLockRef = useRef(false);

  const handleSongEnded = useCallback(async () => {
    if (!currentSong) return;
    if (songEndedLockRef.current) {
      console.warn("[kiosk] handleSongEnded re-entry blocked by lock");
      return;
    }
    songEndedLockRef.current = true;
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

        // Release the lock after a short cooldown so back-to-back skips can't
        // cascade through the queue, but legitimate end-of-song transitions
        // proceed normally.
        setTimeout(() => {
          songEndedLockRef.current = false;
        }, 5000);
      },
    });
  }, [currentSong, markPlayedMutation, refetchQueue, checkAndPlayAnnouncement]);

  // Phase 2 native backend: with MusicKitPlayer unmounted, no `ended` event
  // ever fires. Instead, schedule handleSongEnded based on the song's known
  // duration. The agent's 1s poll loop will then notice the server cleared
  // nowPlaying and pause the Music app; once the kiosk's auto-play effect
  // picks the next song and POSTs /play, the agent starts the next track.
  // Inter-song gap is bounded by (agent poll + AppleScript latency) ~= 1-2s.
  useEffect(() => {
    if (!isNativeBackend || isDisplayOnly) return;
    if (!currentSong?.duration) return;
    // 250ms safety margin so we fire handleSongEnded just before Apple Music
    // can auto-advance to its algorithmic up-next (we also set repeat=one
    // in the agent as a belt-and-braces defense).
    const ms = Math.max(1000, currentSong.duration * 1000 - 250);
    const timer = window.setTimeout(() => {
      handleSongEnded();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [isNativeBackend, isDisplayOnly, currentSong?.id, currentSong?.duration, handleSongEnded]);

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

  const displayTitle = isDisplayOnly
    ? (nowPlaying?.title || lastPlayedSong?.title)
    : (currentSong?.title || nowPlaying?.title || lastPlayedSong?.title);
  const displayArtist = isDisplayOnly
    ? (nowPlaying?.artist || lastPlayedSong?.artist)
    : (currentSong?.artist || nowPlaying?.artist || lastPlayedSong?.artist);
  const displayCover = isDisplayOnly
    ? (nowPlaying?.albumCover || lastPlayedSong?.albumCover)
    : (currentSong?.albumCover || nowPlaying?.albumCover || lastPlayedSong?.albumCover);
  const displayPreview = isDisplayOnly ? undefined : currentSong?.previewUrl;
  const displayExplicit = isDisplayOnly
    ? nowPlaying?.isExplicit
    : (currentSong?.isExplicit || nowPlaying?.isExplicit);

  const displayNowPlayingId = isDisplayOnly ? nowPlaying?.id : currentSong?.id;
  const upNextItems = queue?.items?.filter((item: any) => 
    item.id !== displayNowPlayingId && 
    item.status !== "played" && 
    item.status !== "playing"
  ).sort((a: any, b: any) => (b.netVotes || 0) - (a.netVotes || 0)).slice(0, 8) || [];

  useEffect(() => {
    if (isSchedulePaused && scheduleStatus.isActive) {
      setIsSchedulePaused(false);
    }
  }, [scheduleStatus.isActive, isSchedulePaused]);

  // Show lock warning when another device is controlling playback (skip in display mode)
  if (!isDisplayOnly && !hasLock && lockedByDevice && isStarted) {
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
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-4 sm:p-6 max-w-sm mx-auto mb-4">
            <p className="text-white font-medium mb-1">Active Device</p>
            <p className="text-amber-400 text-lg font-semibold">{lockedByDevice}</p>
            <p className="text-gray-500 text-sm mt-2">
              Close the kiosk on that device, or take over here.
            </p>
          </div>
          <button
            onClick={async () => {
              if (!code) return;
              if (!confirm(`Stop playback on "${lockedByDevice}" and play here instead?`)) return;
              try {
                // Atomically transfer the lock to this device so the old
                // device can't immediately re-claim it on its next heartbeat.
                const result = await releaseKioskLock(code, {
                  newDeviceId: deviceId,
                  newDeviceName: deviceName,
                });
                if (result.transferredTo === deviceId) {
                  setHasLock(true);
                  setLockedByDevice(null);
                } else {
                  // Server didn't confirm us as the new holder — keep showing
                  // the locked screen and let the next heartbeat reconcile.
                  alert("Couldn't take over playback. Please try again.");
                }
              } catch (err) {
                alert("Couldn't take over playback. Please try again.");
              }
            }}
            className="px-6 py-3 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 rounded-full text-white font-medium flex items-center gap-2 mx-auto transition-colors"
            data-testid="button-take-over-kiosk"
          >
            <Speaker className="w-4 h-4" />
            Play here instead
          </button>
        </div>
      </div>
    );
  }

  if (!isDisplayOnly && (isSchedulePaused || (!isStarted && venue?.kioskScheduleEnabled && !scheduleStatus.isActive))) {
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

  if (!isDisplayOnly && !isStarted) {
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

  const pairingBanner = !isDisplayOnly && !isPaired && pairingCode ? (
    <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-indigo-600/95 to-purple-700/95 backdrop-blur-sm text-white px-4 py-3 flex items-center justify-center gap-4 shadow-lg">
      <div className="text-sm sm:text-base">
        <span className="font-semibold">Connect Apple Music:</span>{" "}
        <span className="text-white/80">visit jukboks.com/pair · code </span>
      </div>
      <div className="text-2xl sm:text-3xl font-mono font-bold tracking-[0.3em] bg-black/30 px-3 py-1 rounded-lg">
        {pairingCode}
      </div>
    </div>
  ) : null;

  // Audio-only render: keeps MusicKitPlayer + all orchestration effects but
  // skips heavy visuals (album art, animations, queue, QR, logo). On a normally
  // headless Pi nobody sees this screen, but if a tech plugs in a monitor for
  // diagnostics we may as well show useful info — render the Pi health stats
  // (CPU temp, memory, Chromium RSS, uptimes) the agent has been reporting.
  // Same color thresholds as the admin VenuesPage card so the same intuition
  // applies. Falls back to "agent not reporting" when no data has come in.
  if (isAudioOnly) {
    return (
      <AudioOnlyKioskView
        code={code}
        venue={venue}
        currentSong={currentSong}
        displayPreview={displayPreview}
        displayTitle={displayTitle}
        displayArtist={displayArtist}
        handleSongEnded={handleSongEnded}
        handleSkip={handleSkip}
        setTogglePlayHandler={setTogglePlayHandler}
        setSkipHandler={setSkipHandler}
        setIsPlaying={setIsPlaying}
        isPlayingAnnouncement={isPlayingAnnouncement}
        currentAnnouncement={currentAnnouncement}
        isPaired={isPaired}
        pairingCode={pairingCode}
        isNativeBackend={isNativeBackend}
      />
    );
  }

  if (isSquareLayout) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col relative overflow-hidden">
        {pairingBanner}
        {/* Native backend: macOS audio agent drives Music.app, no browser audio. */}
        {!isDisplayOnly && !isNativeBackend && (
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
        )}

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {isPlayingAnnouncement && currentAnnouncement ? (
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                {currentAnnouncement.imageUrl ? (
                  <img
                    src={currentAnnouncement.imageUrl}
                    alt={currentAnnouncement.name}
                    className="w-40 h-40 rounded-2xl shadow-2xl object-cover"
                  />
                ) : (
                  <div className="w-40 h-40 rounded-2xl shadow-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
                    <Volume2 className="w-20 h-20 text-white/80 animate-pulse" />
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">{currentAnnouncement.name}</h2>
              <p className="text-lg text-gray-300">Announcement</p>
            </div>
          ) : (
            <div className="text-center w-full">
              {displayCover && (
                <div className="mb-4 flex justify-center">
                  {/* key={displayCover} forces React to fully unmount/remount the img on song
                      change so the renderer can free the previous decoded bitmap immediately
                      instead of caching it. decoding=async keeps the next decode off the main
                      thread so the song change never stutters the UI. */}
                  <img
                    key={displayCover}
                    src={displayCover}
                    alt={displayTitle || "Album"}
                    decoding="async"
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

        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          {venue?.logoUrl ? (
            <img src={venue.logoUrl} alt="" className="h-6 w-auto opacity-50" />
          ) : (
            <img src="/assets/logo-app.png" alt="Jukboks" className="h-6 w-6 rounded opacity-50" />
          )}
          {isDisplayOnly && (
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Display</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col lg:flex-row relative">
      {pairingBanner}
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
                {currentAnnouncement.imageUrl ? (
                  <img
                    src={currentAnnouncement.imageUrl}
                    alt={currentAnnouncement.name}
                    className="w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-2xl sm:rounded-3xl shadow-2xl object-cover"
                  />
                ) : (
                  <div className="w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-2xl sm:rounded-3xl shadow-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
                    <Volume2 className="w-24 h-24 sm:w-36 sm:h-36 lg:w-48 lg:h-48 text-white/80 animate-pulse" />
                  </div>
                )}
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
                    {/* key={displayCover} on the wrapper unmounts both the blurred BG and the
                        img on song change, so the renderer releases the prior song's two
                        decoded image buffers immediately. decoding=async keeps the next
                        song's decode off the main thread. */}
                    <div key={displayCover} className="relative">
                      <div className="absolute inset-0 rounded-2xl sm:rounded-3xl blur-3xl opacity-30" style={{ background: `url(${displayCover}) center/cover` }} />
                      <img
                        src={displayCover}
                        alt={displayTitle || "Album"}
                        decoding="async"
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

              {/* Native backend: macOS audio agent drives Music.app, no browser audio. */}
              {!isDisplayOnly && !isNativeBackend && (
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
              )}
            </>
          )}
        </div>
      </div>

      {/* Logo in bottom left - hidden on mobile */}
      <div className="hidden sm:flex absolute bottom-4 left-4 items-center gap-3">
        {venue?.logoUrl ? (
          <img src={venue.logoUrl} alt="" className="h-12 w-auto opacity-70" />
        ) : (
          <img src="/assets/logo-app.png" alt="Jukboks" className="h-12 w-12 rounded-xl opacity-70" />
        )}
        {isDisplayOnly && (
          <span className="text-xs text-gray-500 uppercase tracking-wider">Display Mode</span>
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

// Stat row with color-coded value matching admin VenuesPage thresholds.
function HealthRow({ label, value, status }: { label: string; value: string; status?: "ok" | "warn" | "bad" | "muted" }) {
  const color =
    status === "bad" ? "text-red-400"
    : status === "warn" ? "text-amber-400"
    : status === "muted" ? "text-white/30"
    : "text-emerald-400";
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-white/50">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}

function fmtUptime(sec: number | null): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function AudioOnlyKioskView(props: {
  code: string | undefined;
  venue: any;
  currentSong: any;
  displayPreview: string | undefined;
  displayTitle: string;
  displayArtist: string;
  handleSongEnded: () => void;
  handleSkip: () => void;
  setTogglePlayHandler: (h: any) => void;
  setSkipHandler: (h: any) => void;
  setIsPlaying: (b: boolean) => void;
  isPlayingAnnouncement: boolean;
  currentAnnouncement: { id: number; name: string; audioUrl: string; imageUrl?: string | null } | null;
  isPaired: boolean;
  pairingCode: string | null;
  isNativeBackend: boolean;
}) {
  const {
    code, venue, currentSong, displayPreview, displayTitle, displayArtist,
    handleSongEnded, handleSkip, setTogglePlayHandler, setSkipHandler, setIsPlaying,
    isPlayingAnnouncement, currentAnnouncement, isPaired, pairingCode, isNativeBackend,
  } = props;

  // Poll the public health endpoint every 30s — same cadence the agent reports.
  const { data: healthData } = useQuery<{ health: any; updatedAt: string | null; ageSeconds: number | null }>({
    queryKey: ["kiosk-health-self", code],
    queryFn: async () => {
      const r = await fetch(`/api/v1/venues/${code}/kiosk-health`);
      if (!r.ok) throw new Error("health fetch failed");
      return r.json();
    },
    enabled: !!code,
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const h = healthData?.health;
  const ageSec = healthData?.ageSeconds ?? null;
  const stale = ageSec != null && ageSec > 120; // >2min = agent likely silent

  const tempStatus = h?.cpuTempC == null ? "muted" : h.cpuTempC >= 80 ? "bad" : h.cpuTempC >= 70 ? "warn" : "ok";
  const memStatus = h?.memUsedPercent == null ? "muted" : h.memUsedPercent >= 90 ? "bad" : h.memUsedPercent >= 75 ? "warn" : "ok";
  const chromiumStatus = h?.chromiumMemMb == null ? "muted" : h.chromiumMemMb >= 1500 ? "bad" : h.chromiumMemMb >= 1000 ? "warn" : "ok";
  const diskStatus = h?.diskUsedPercent == null ? "muted" : h.diskUsedPercent >= 90 ? "bad" : h.diskUsedPercent >= 75 ? "warn" : "ok";
  const ageStatus = ageSec == null ? "muted" : ageSec > 120 ? "bad" : ageSec > 60 ? "warn" : "ok";

  return (
    <div className="min-h-screen bg-black text-white font-mono p-4 sm:p-6 flex flex-col gap-4">
      {/* Native backend: macOS audio agent drives Music.app — skip browser audio. */}
      {!isNativeBackend && (
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
      )}

      {/* Header */}
      <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
        <div className="text-sm sm:text-base font-semibold text-white/90">
          {venue?.name || code} <span className="text-white/40">· audio-only</span>
        </div>
        <div className="text-[10px] sm:text-xs text-white/40">jukboks.com/kiosk/{code}</div>
      </div>

      {/* Pairing banner */}
      {!isPaired && pairingCode && (
        <div className="bg-amber-900/40 border border-amber-700/50 rounded p-3 text-amber-200 text-sm">
          Apple Music not paired. Visit <span className="font-bold">jukboks.com/pair</span> · code <span className="font-mono text-lg tracking-widest">{pairingCode}</span>
        </div>
      )}

      {/* Now playing */}
      <div className="text-xs sm:text-sm">
        <div className="text-white/40 mb-1">Now playing</div>
        <div className="text-white truncate">
          {isPlayingAnnouncement && currentAnnouncement
            ? `📢 ${currentAnnouncement.name}`
            : displayTitle
              ? `${displayTitle} — ${displayArtist}`
              : "(idle)"}
        </div>
      </div>

      {/* Pi health */}
      <div className="text-xs sm:text-sm">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-white/40">Pi health</span>
          <span className={`text-[10px] ${stale ? "text-red-400" : "text-white/30"}`}>
            {ageSec == null ? "no data ever" : stale ? `agent silent ${fmtUptime(ageSec)}` : `updated ${ageSec}s ago`}
          </span>
        </div>
        {h ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <HealthRow label="CPU temp" value={h.cpuTempC != null ? `${h.cpuTempC}°C` : "—"} status={tempStatus} />
            <HealthRow label="CPU load (1m)" value={h.cpuLoad1 != null ? `${h.cpuLoad1}` : "—"} status="ok" />
            <HealthRow label="Memory used" value={h.memUsedPercent != null ? `${h.memUsedPercent}% (${Math.round((h.memTotalMb ?? 0) - (h.memFreeMb ?? 0))} / ${Math.round(h.memTotalMb ?? 0)} MB)` : "—"} status={memStatus} />
            <HealthRow label="Disk used" value={h.diskUsedPercent != null ? `${h.diskUsedPercent}%` : "—"} status={diskStatus} />
            <HealthRow label="Chromium RSS" value={h.chromiumMemMb != null ? `${Math.round(h.chromiumMemMb)} MB` : "—"} status={chromiumStatus} />
            <HealthRow label="Chromium uptime" value={fmtUptime(h.chromiumUptimeSeconds)} status={h.chromiumRunning === false ? "bad" : "ok"} />
            <HealthRow label="System uptime" value={fmtUptime(h.uptimeSeconds)} status="ok" />
            <HealthRow label="Heartbeat age" value={ageSec != null ? `${ageSec}s` : "—"} status={ageStatus} />
          </div>
        ) : (
          <div className="text-white/30 italic">
            Audio agent has not reported. Install with:<br />
            <span className="text-white/50">curl -fsSL https://jukboks.com/scripts/install-audio-agent.sh | bash</span>
          </div>
        )}
      </div>

      <div className="text-[10px] text-white/30 mt-auto pt-4 border-t border-white/10">
        Audio-only mode renders no album art / queue / animations to minimize renderer memory.
        Display lives separately at <span className="text-white/50">/kiosk/{code}?display=true</span>.
      </div>
    </div>
  );
}
