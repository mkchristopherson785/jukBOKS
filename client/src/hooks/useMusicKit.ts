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

  const configure = useCallback(async () => {
    if (initializingRef.current || state.isConfigured) return;
    initializingRef.current = true;

    try {
      const response = await fetch("/api/apple-music/token");
      if (!response.ok) {
        throw new Error("Failed to get Apple Music token");
      }
      const { token } = await response.json();

      await window.MusicKit.configure({
        developerToken: token,
        app: {
          name: "Jukboks",
          build: "1.0.0",
        },
      });

      musicKitRef.current = window.MusicKit.getInstance();
      
      musicKitRef.current.addEventListener("playbackStateDidChange", () => {
        const isPlaying = musicKitRef.current.playbackState === window.MusicKit.PlaybackStates.playing;
        setState(prev => ({ ...prev, isPlaying }));
      });

      const alreadyAuthorized = musicKitRef.current.isAuthorized;
      setState(prev => ({ 
        ...prev, 
        isConfigured: true, 
        isAuthorized: alreadyAuthorized,
        error: null 
      }));
    } catch (error: any) {
      console.error("MusicKit configuration failed:", error);
      setState(prev => ({ ...prev, error: error.message }));
    } finally {
      initializingRef.current = false;
    }
  }, [state.isConfigured]);

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

  const playSong = useCallback(async (trackId: string) => {
    if (!musicKitRef.current) {
      console.error("MusicKit not configured");
      return false;
    }

    try {
      await musicKitRef.current.setQueue({
        song: trackId,
      });
      await musicKitRef.current.play();
      setState(prev => ({ ...prev, currentTrackId: trackId, isPlaying: true, error: null }));
      return true;
    } catch (error: any) {
      console.error("Failed to play song:", error);
      setState(prev => ({ ...prev, error: `Playback failed: ${error.message}` }));
      return false;
    }
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
    playSong,
    pause,
    stop,
    skipToNext,
    onPlaybackEnded,
  };
}
