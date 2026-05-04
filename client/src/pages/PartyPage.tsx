import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Radio, Pause, AlertCircle } from "lucide-react";
import { fetchParty, joinParty, submitRequest, submitVote, registerListener, unregisterListener } from "../lib/api";

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : "99, 102, 241";
}
import { SongSearch } from "../components/SongSearch";
import { QueueList } from "../components/QueueList";
import { NowPlaying } from "../components/NowPlaying";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { useMusicKit } from "../hooks/useMusicKit";
import { useGuestFavorites } from "../hooks/useGuestFavorites";
import type { Track } from "../hooks/useAppleMusic";

export default function PartyPage() {
  const { code } = useParams<{ code: string }>();
  const queryClient = useQueryClient();
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [showJoinForm, setShowJoinForm] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Map<number, "up" | "down">>(new Map());
  const [isListening, setIsListening] = useState(false);
  const [listeningTrackId, setListeningTrackId] = useState<string | null>(null);
  const { favorites, addFavorite } = useGuestFavorites(code);
  
  const { 
    isConfigured, 
    isAuthorized, 
    isPlaying, 
    configure, 
    authorize, 
    playSong, 
    stop,
    error: musicKitError 
  } = useMusicKit();

  useEffect(() => {
    const savedToken = localStorage.getItem(`jukboks_guest_${code}`);
    if (savedToken) {
      setGuestToken(savedToken);
      setShowJoinForm(false);
    }
  }, [code]);

  const { data: party, isLoading, error } = useQuery({
    queryKey: ["party", code],
    queryFn: () => fetchParty(code!),
    enabled: !!code && !showJoinForm,
    refetchInterval: 5000,
  });

  // Generate/retrieve a persistent listener ID
  const [listenerId] = useState(() => {
    const stored = localStorage.getItem(`jukboks_listener_id`);
    if (stored) return stored;
    const newId = `listener_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(`jukboks_listener_id`, newId);
    return newId;
  });
  
  // Register as listener when listening starts, unregister when it stops
  useEffect(() => {
    if (!code || !isListening) return;
    
    const savedName = localStorage.getItem(`jukboks_guest_name_${code}`) || guestName || "Anonymous";
    
    // Register immediately
    registerListener(code, listenerId, savedName).catch(console.error);
    
    // Send heartbeat every 30 seconds
    const heartbeatInterval = setInterval(() => {
      registerListener(code, listenerId, savedName).catch(console.error);
    }, 30000);
    
    // Cleanup on unmount or when listening stops
    return () => {
      clearInterval(heartbeatInterval);
      unregisterListener(code, listenerId).catch(console.error);
    };
  }, [code, isListening, listenerId, guestName]);
  
  // Sync playback when listening and the now playing changes
  useEffect(() => {
    if (isListening && isAuthorized && party?.nowPlaying?.trackId) {
      const currentTrackId = party.nowPlaying.trackId;
      if (currentTrackId !== listeningTrackId) {
        setListeningTrackId(currentTrackId);
        playSong(currentTrackId);
      }
    }
  }, [isListening, isAuthorized, party?.nowPlaying?.trackId, listeningTrackId, playSong]);

  const handleListenLive = useCallback(async () => {
    if (isListening) {
      // Stop listening
      stop();
      setIsListening(false);
      setListeningTrackId(null);
      return;
    }

    // Start listening
    if (!isConfigured) {
      await configure();
    }
    
    if (!isAuthorized) {
      const success = await authorize();
      if (!success) return;
    }

    setIsListening(true);
    
    // Start playing the current song
    if (party?.nowPlaying?.trackId) {
      setListeningTrackId(party.nowPlaying.trackId);
      playSong(party.nowPlaying.trackId);
    }
  }, [isListening, isConfigured, isAuthorized, configure, authorize, stop, playSong, party?.nowPlaying?.trackId]);

  const [guestId, setGuestId] = useState<number | null>(() => {
    const saved = localStorage.getItem(`jukboks_guest_id_${code}`);
    return saved ? parseInt(saved) : null;
  });

  const joinMutation = useMutation({
    mutationFn: () => joinParty(code!, guestName),
    onSuccess: (data) => {
      setGuestToken(data.sessionToken);
      setGuestId(data.guestId);
      localStorage.setItem(`jukboks_guest_${code}`, data.sessionToken);
      localStorage.setItem(`jukboks_guest_name_${code}`, guestName);
      localStorage.setItem(`jukboks_guest_id_${code}`, String(data.guestId));
      setShowJoinForm(false);
    },
  });

  const requestMutation = useMutation({
    mutationFn: (track: Track) =>
      submitRequest(
        party?.venue?.code || code!,
        {
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          albumCover: track.albumCover,
          duration: track.duration,
          isExplicit: track.isExplicit,
          previewUrl: track.previewUrl,
        },
        guestToken || undefined
      ),
    onSuccess: (_data: any, track: Track) => {
      queryClient.invalidateQueries({ queryKey: ["party", code] });
      setRequestError(null);
      addFavorite(track);
    },
    onError: (error: Error) => {
      setRequestError(error.message || "Failed to add song. Please try again.");
      setTimeout(() => setRequestError(null), 5000);
    },
  });

  const voteMutation = useMutation({
    mutationFn: ({ requestId, voteType }: { requestId: number; voteType: "up" | "down" }) =>
      submitVote(party?.venue?.code || code!, requestId, voteType, guestToken || undefined),
    onSuccess: (data, { requestId, voteType }) => {
      if (data.action === "removed") {
        setUserVotes((prev) => {
          const newMap = new Map(prev);
          newMap.delete(requestId);
          return newMap;
        });
      } else {
        setUserVotes((prev) => new Map(prev).set(requestId, voteType));
      }
      queryClient.invalidateQueries({ queryKey: ["party", code] });
    },
  });

  if (showJoinForm) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-transparent">
        <div className="w-full max-w-md bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 p-8">
          <div className="flex items-center mb-6">
            <img src="/assets/logo-full.png" alt="Jukboks" className="h-14" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Join the Party</h2>
          <p className="text-gray-400 mb-6">Enter your name to start requesting songs</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (guestName.trim()) {
                joinMutation.mutate();
              }
            }}
          >
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />
            <button
              type="submit"
              disabled={!guestName.trim() || joinMutation.isPending}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
            >
              {joinMutation.isPending ? "Joining..." : "Join Party"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !party) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-transparent">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Party Not Found</h2>
          <p className="text-gray-400">This party may have ended or the code is invalid.</p>
        </div>
      </div>
    );
  }

  const brandColor = party?.branding?.primaryColor || "#6366f1";
  const queueTrackIds = new Set([
    ...(party.queue || []).map((item: any) => item.trackId),
    ...(party.nowPlaying?.trackId ? [party.nowPlaying.trackId] : []),
  ]);

  return (
    <div className="min-h-screen pb-8 bg-transparent" style={{ "--brand-color": brandColor, "--brand-color-rgb": hexToRgb(brandColor) } as React.CSSProperties}>
      <ConnectionStatus isError={!!error} isLoading={isLoading} />
      <header className="border-b border-white/10 backdrop-blur-lg bg-black/20 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {party.branding?.logoUrl ? (
              <img src={party.branding.logoUrl} alt="" className="h-10 w-auto" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Music2 className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-white">{party.venue?.name}</h1>
              <p className="text-xs text-gray-400">{party.branding?.organizationName}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-8">
          <NowPlaying
            title={party.nowPlaying?.title}
            artist={party.nowPlaying?.artist}
            albumCover={party.nowPlaying?.albumCover}
            compact
          />
          
          {/* Listen Live Button */}
          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={handleListenLive}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all ${
                isListening && isPlaying
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : "text-white hover:opacity-90"
              }`}
              style={!(isListening && isPlaying) ? { background: `linear-gradient(to right, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #7c3aed))` } : undefined}
            >
              {isListening && isPlaying ? (
                <>
                  <Pause className="w-5 h-5" />
                  Stop Listening
                </>
              ) : (
                <>
                  <Radio className="w-5 h-5" />
                  Listen Live
                </>
              )}
            </button>
            {isListening && isPlaying && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Synced with venue
              </p>
            )}
            {musicKitError && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {musicKitError}
              </p>
            )}
            <p className="text-xs text-gray-500">Requires Apple Music subscription</p>
          </div>
        </div>

        <div className="mb-8 relative z-30">
          <h2 className="text-lg font-semibold text-white mb-4">Request a Song</h2>
          <SongSearch
            onSelect={(track) => requestMutation.mutate(track)}
            allowExplicit={party.venue?.allowExplicit || false}
            blockHolidayMusic={party.venue?.blockHolidayMusic || false}
            queueTrackIds={queueTrackIds}
          />
          {requestError && (
            <div className="mt-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {requestError}
            </div>
          )}
        </div>

        {favorites.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Your Favorites</h2>
            <div className="space-y-2">
              {favorites.slice(0, 8).map((song) => {
                const inQueue = queueTrackIds.has(song.trackId);
                return (
                  <div key={song.trackId} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                    {song.albumCover ? (
                      <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Music2 className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate text-sm">{song.title}</p>
                      <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                    </div>
                    {inQueue ? (
                      <span className="text-xs text-indigo-400 font-medium px-2 py-1 bg-indigo-500/10 rounded-lg">In Queue</span>
                    ) : (
                      <button
                        onClick={() => requestMutation.mutate({
                          id: song.trackId,
                          title: song.title,
                          artist: song.artist,
                          album: song.album,
                          albumCover: song.albumCover,
                          previewUrl: song.previewUrl,
                          duration: song.duration,
                          isExplicit: song.isExplicit,
                        } as Track)}
                        disabled={requestMutation.isPending}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors text-white hover:opacity-90"
                        style={{ background: `linear-gradient(to right, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #7c3aed))` }}
                      >
                        Request
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Up Next</h2>
          <QueueList
            items={party.queue || []}
            onVote={(requestId, voteType) => voteMutation.mutate({ requestId, voteType })}
            userVotes={userVotes}
            currentGuestId={guestId}
          />
        </div>

        {party.recentlyPlayed && party.recentlyPlayed.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white mb-4">Recently Played</h2>
            <div className="space-y-2">
              {party.recentlyPlayed.slice(0, 10).map((song: any) => (
                <div key={song.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                  {song.albumCover ? (
                    <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg object-cover opacity-70" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
                      <Music2 className="w-5 h-5 text-gray-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 font-medium truncate text-sm">{song.title}</p>
                    <p className="text-gray-500 text-xs truncate">{song.artist}</p>
                  </div>
                  {song.requesterName && (
                    <span className="text-gray-600 text-xs truncate max-w-[80px]">{song.requesterName}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
