import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, ThumbsUp, SkipForward, Play, User, Radio } from "lucide-react";
import { fetchVenue, fetchNowPlaying, fetchQueue, fetchQRCode } from "../lib/api";
import { MusicKitPlayer } from "../components/MusicKitPlayer";
import { useState, useEffect, useCallback } from "react";

const API_BASE = "";

export default function KioskPage() {
  const { code } = useParams<{ code: string }>();
  const queryClient = useQueryClient();
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

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

  const triggerAutoPlay = useCallback(async () => {
    if (isAutoPlaying) return;
    setIsAutoPlaying(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/venues/${code}/auto-play`, {
        method: "POST",
      });
      if (res.ok) {
        await refetchQueue();
      }
    } catch (error) {
      console.error("Auto-play error:", error);
    } finally {
      // Add a small delay before allowing next auto-play attempt
      setTimeout(() => setIsAutoPlaying(false), 3000);
    }
  }, [code, refetchQueue, isAutoPlaying]);

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

  const handleSongEnded = useCallback(() => {
    if (currentSong) {
      setIsTransitioning(true);
      markPlayedMutation.mutate(currentSong.id, {
        onSettled: () => {
          setCurrentSong(null);
          setIsTransitioning(false);
          refetchQueue();
        },
      });
    }
  }, [currentSong, markPlayedMutation, refetchQueue]);

  const handleSkip = useCallback(() => {
    if (currentSong) {
      setIsTransitioning(true);
      markPlayedMutation.mutate(currentSong.id, {
        onSettled: () => {
          setCurrentSong(null);
          setIsTransitioning(false);
          refetchQueue();
        },
      });
    }
  }, [currentSong, markPlayedMutation, refetchQueue]);

  const displayTitle = currentSong?.title || nowPlaying?.title;
  const displayArtist = currentSong?.artist || nowPlaying?.artist;
  const displayCover = currentSong?.albumCover || nowPlaying?.albumCover;
  const displayPreview = currentSong?.previewUrl;

  const upNextItems = queue?.items?.filter((item: any) => 
    item.id !== currentSong?.id && 
    item.status !== "played" && 
    item.status !== "playing"
  ).sort((a: any, b: any) => (b.netVotes || 0) - (a.netVotes || 0)).slice(0, 8) || [];

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8 flex justify-center">
            {venue?.logoUrl ? (
              <img src={venue.logoUrl} alt="" className="h-24 w-auto" />
            ) : (
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Music2 className="w-14 h-14 text-white" />
              </div>
            )}
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">{venue?.name || "Jukboks"}</h1>
          <p className="text-gray-400 mb-8">Kiosk Mode</p>
          <button
            onClick={() => setIsStarted(true)}
            className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full text-white text-xl font-semibold flex items-center gap-3 mx-auto hover:scale-105 transition-transform"
          >
            <Play className="w-6 h-6" />
            Start Kiosk
          </button>
          <p className="text-gray-500 text-sm mt-6">Click to enable music playback</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex">
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="mb-8 flex items-center gap-4">
          {venue?.logoUrl ? (
            <img src={venue.logoUrl} alt="" className="h-16 w-auto" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Music2 className="w-10 h-10 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">{venue?.name || "Jukboks"}</h1>
            <p className="text-gray-400">{venue?.organizationName}</p>
          </div>
        </div>

        <div className="w-full max-w-2xl">
          {displayCover && (
            <div className="mb-8 flex justify-center">
              <img 
                src={displayCover} 
                alt={displayTitle || "Album"} 
                className="w-64 h-64 rounded-2xl shadow-2xl object-cover"
              />
            </div>
          )}
          
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-2">{displayTitle || "No song playing"}</h2>
            <p className="text-xl text-gray-300">{displayArtist || "Request a song to get started"}</p>
          </div>

          <MusicKitPlayer
            trackId={currentSong?.trackId || null}
            previewUrl={displayPreview}
            onEnded={handleSongEnded}
            onSkip={handleSkip}
          />

          {currentSong && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleSkip}
                disabled={isTransitioning}
                className="flex items-center gap-2 px-6 py-3 bg-gray-700/50 hover:bg-gray-600/50 rounded-xl transition-colors text-gray-300 disabled:opacity-50"
              >
                <SkipForward className="w-5 h-5" />
                {isTransitioning ? "Skipping..." : "Skip Song"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="w-96 bg-black/30 backdrop-blur-lg border-l border-white/10 p-6 flex flex-col">
        <h2 className="text-xl font-bold text-white mb-6">Up Next</h2>

        <div className="flex-1 overflow-y-auto space-y-3">
          {upNextItems.map((item: any, index: number) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-xl ${
                item.previewUrl ? "bg-white/5" : "bg-white/5 opacity-50"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                {index + 1}
              </div>
              {item.albumCover ? (
                <img src={item.albumCover} alt="" className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center">
                  <Music2 className="w-5 h-5 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate text-sm flex items-center gap-1">
                  {item.title}
                  {item.isExplicit && (
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-gray-600 text-[8px] font-bold rounded text-gray-300">
                      E
                    </span>
                  )}
                </p>
                <p className="text-gray-400 text-xs truncate">{item.artist}</p>
                {item.isAutoPlay ? (
                  <p className="text-purple-400 text-xs flex items-center gap-1">
                    <Radio className="w-3 h-3" />
                    Auto-play
                  </p>
                ) : item.requesterName ? (
                  <p className="text-gray-500 text-xs flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {item.requesterName}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 text-indigo-400 text-sm">
                <ThumbsUp className="w-4 h-4" />
                {item.netVotes || 0}
              </div>
            </div>
          ))}

          {upNextItems.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <Music2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No songs in queue</p>
            </div>
          )}
        </div>

        {qrData?.qrCode && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center">
              <img src={qrData.qrCode} alt="Scan to join" className="w-32 h-32" />
              <p className="text-gray-800 font-medium mt-2 text-center text-sm">
                Scan to request songs
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
