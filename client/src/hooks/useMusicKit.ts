import { useState, useEffect, useCallback, useRef } from "react";

declare global {
  interface Window {
    MusicKit: any;
  }
}

interface MusicKitState {
  isConfigured: boolean;
  isAuthorized: boolean;
  isPlaying: boolean;
  currentTrackId: string | null;
  error: string | null;
}

export function useMusicKit() {
  const [state, setState] = useState<MusicKitState>({
    isConfigured: false,
    isAuthorized: false,
    isPlaying: false,
    currentTrackId: null,
    error: null,
  });
  
  const musicKitRef = useRef<any>(null);
  const initializingRef = useRef(false);
  const configuredRef = useRef(false);

  const configure = useCallback(async () => {
    if (initializingRef.current || configuredRef.current) return;
    initializingRef.current = true;

    try {
      console.log("Fetching Apple Music token...");
      const response = await fetch("/api/apple-music/token");
      if (!response.ok) {
        throw new Error("Failed to get Apple Music token");
      }
      const { token } = await response.json();
      console.log("Token received, configuring MusicKit...");

      await window.MusicKit.configure({
        developerToken: token,
        app: {
          name: "Jukboks",
          build: "1.0.0",
        },
      });

      musicKitRef.current = window.MusicKit.getInstance();
      console.log("MusicKit instance created");
      
      musicKitRef.current.addEventListener("playbackStateDidChange", () => {
        const isPlaying = musicKitRef.current.playbackState === window.MusicKit.PlaybackStates.playing;
        setState(prev => ({ ...prev, isPlaying }));
      });

      const alreadyAuthorized = musicKitRef.current.isAuthorized;
      configuredRef.current = true;
      setState(prev => ({ 
        ...prev, 
        isConfigured: true, 
        isAuthorized: alreadyAuthorized,
        error: null 
      }));
      console.log("MusicKit configured successfully, authorized:", alreadyAuthorized);
    } catch (error: any) {
      console.error("MusicKit configuration failed:", error);
      setState(prev => ({ ...prev, error: error.message }));
    } finally {
      initializingRef.current = false;
    }
  }, []);

  const authorize = useCallback(async () => {
    if (!musicKitRef.current) return false;
    
    try {
      await musicKitRef.current.authorize();
      setState(prev => ({ ...prev, isAuthorized: true, error: null }));
      return true;
    } catch (error: any) {
      console.error("MusicKit authorization failed:", error);
      setState(prev => ({ ...prev, error: "Authorization failed. Make sure you have an Apple Music subscription." }));
      return false;
    }
  }, []);

  // Apply a Music User Token that was previously obtained on another device
  // (e.g. paired from the venue owner's phone). Setting the token directly
  // marks the MusicKit instance as authorized without showing Apple's sign-in
  // popup, so a headless kiosk can stream full songs.
  const applyMusicUserToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      // Wait for MusicKit to be configured (up to ~5s)
      for (let i = 0; i < 50 && !musicKitRef.current; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (!musicKitRef.current || !token) return false;
      musicKitRef.current.musicUserToken = token;
      setState(prev => ({ ...prev, isAuthorized: true, error: null }));
      return true;
    } catch (error: any) {
      console.error("Failed to apply music user token:", error);
      return false;
    }
  }, []);

  const getMusicUserToken = useCallback((): string | null => {
    return musicKitRef.current?.musicUserToken || null;
  }, []);

  // MusicKit is a global singleton (window.MusicKit.getInstance()), so a token
  // applied via one hook instance also authorizes other instances on the page.
  // Each hook instance keeps its own React `isAuthorized` state though, so we
  // poll the singleton's `isAuthorized` and reconcile state when it flips.
  // This way <MusicKitPlayer/>'s hook picks up a token applied from KioskPage.
  useEffect(() => {
    if (!state.isConfigured) return;
    // 5s is plenty: this is a defensive reconciliation loop for a token that
    // changes at most once per pairing event (which itself takes >5s end to
    // end). Was 1s, which fired 60×/min forever on every long-running kiosk.
    const interval = setInterval(() => {
      const live = !!musicKitRef.current?.isAuthorized;
      setState(prev => (prev.isAuthorized === live ? prev : { ...prev, isAuthorized: live }));
    }, 5000);
    return () => clearInterval(interval);
  }, [state.isConfigured]);

  const playSong = useCallback(async (trackId: string, options?: { startPositionMs?: number }) => {
    if (!musicKitRef.current) {
      console.error("MusicKit not configured");
      return false;
    }

    try {
      await musicKitRef.current.setQueue({
        song: trackId,
      });
      await musicKitRef.current.play();
      // Seek to the venue's current playback position so listen-along is
      // synchronized to the second instead of restarting the song.
      const startMs = options?.startPositionMs;
      if (typeof startMs === "number" && startMs > 1500) {
        try {
          await musicKitRef.current.seekToTime(startMs / 1000);
        } catch (seekErr) {
          console.warn("seekToTime failed:", seekErr);
        }
      }
      setState(prev => ({ ...prev, currentTrackId: trackId, isPlaying: true, error: null }));
      return true;
    } catch (error: any) {
      console.error("Failed to play song:", error);
      setState(prev => ({ ...prev, error: `Playback failed: ${error.message}` }));
      return false;
    }
  }, []);

  const seekToTime = useCallback(async (positionMs: number) => {
    if (!musicKitRef.current) return false;
    try {
      await musicKitRef.current.seekToTime(Math.max(0, positionMs) / 1000);
      return true;
    } catch (error) {
      console.warn("seekToTime failed:", error);
      return false;
    }
  }, []);

  const getCurrentPlaybackTimeMs = useCallback((): number | null => {
    if (!musicKitRef.current) return null;
    const t = musicKitRef.current.currentPlaybackTime;
    return typeof t === "number" ? t * 1000 : null;
  }, []);

  const pause = useCallback(async () => {
    if (!musicKitRef.current) return;
    await musicKitRef.current.pause();
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const stop = useCallback(async () => {
    if (!musicKitRef.current) return;
    await musicKitRef.current.stop();
    setState(prev => ({ ...prev, isPlaying: false, currentTrackId: null }));
  }, []);

  const skipToNext = useCallback(async () => {
    if (!musicKitRef.current) return;
    try {
      await musicKitRef.current.skipToNextItem();
    } catch (error) {
      console.error("Failed to skip:", error);
    }
  }, []);

  const onPlaybackEnded = useCallback((callback: () => void) => {
    if (!musicKitRef.current) return () => {};
    
    const handler = (event: any) => {
      if (event.state === window.MusicKit.PlaybackStates.completed ||
          event.state === window.MusicKit.PlaybackStates.ended) {
        callback();
      }
    };
    
    musicKitRef.current.addEventListener("playbackStateDidChange", handler);
    return () => {
      musicKitRef.current?.removeEventListener("playbackStateDidChange", handler);
    };
  }, []);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max
    
    const checkMusicKit = () => {
      attempts++;
      console.log("Checking for MusicKit, attempt:", attempts, "available:", !!window.MusicKit);
      
      if (window.MusicKit) {
        console.log("MusicKit found, configuring...");
        configure();
      } else if (attempts < maxAttempts) {
        setTimeout(checkMusicKit, 100);
      } else {
        console.error("MusicKit failed to load after 5 seconds");
        setState(prev => ({ ...prev, error: "MusicKit failed to load. Please refresh the page." }));
      }
    };
    checkMusicKit();
  }, [configure]);

  return {
    ...state,
    musicKit: musicKitRef.current,
    configure,
    authorize,
    applyMusicUserToken,
    getMusicUserToken,
    playSong,
    pause,
    stop,
    skipToNext,
    onPlaybackEnded,
    seekToTime,
    getCurrentPlaybackTimeMs,
  };
}
