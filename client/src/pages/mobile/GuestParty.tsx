import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Search, ListMusic, Radio, ThumbsUp, ThumbsDown, ArrowLeft, Headphones } from "lucide-react";
import { fetchParty, joinParty, submitRequest, submitVote, registerListener, unregisterListener } from "../../lib/api";
import { SongSearch } from "../../components/SongSearch";
import { ConnectionStatus } from "../../components/ConnectionStatus";
import { useMusicKit } from "../../hooks/useMusicKit";
import { useGuestFavorites } from "../../hooks/useGuestFavorites";
import type { Track } from "../../hooks/useAppleMusic";

type GuestTab = "playing" | "search" | "queue";

interface GuestPartyProps {
  venueCode: string;
  onLeave: () => void;
}

export default function GuestParty({ venueCode, onLeave }: GuestPartyProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<GuestTab>("playing");
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [savedGuestName, setSavedGuestName] = useState<string | undefined>(undefined);
  const [showJoinForm, setShowJoinForm] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Map<number, "up" | "down">>(new Map());
  const [isListening, setIsListening] = useState(false);
  const [listeningTrackId, setListeningTrackId] = useState<string | null>(null);
  const { favorites, addFavorite, removeFavorite } = useGuestFavorites(venueCode, savedGuestName);
  
  const { isAuthorized, isPlaying, authorize, playSong, stop } = useMusicKit();

  useEffect(() => {
    const savedToken = localStorage.getItem(`jukboks_guest_${venueCode}`);
    const savedName = localStorage.getItem(`jukboks_guest_name_${venueCode}`);
    if (savedToken) {
      setGuestToken(savedToken);
      setShowJoinForm(false);
      if (savedName) {
        setSavedGuestName(savedName);
      }
    }
  }, [venueCode]);

  const { data: party, isError: partyError, isLoading: partyLoading } = useQuery({
    queryKey: ["party", venueCode],
    queryFn: () => fetchParty(venueCode),
    enabled: !!venueCode && !showJoinForm,
    refetchInterval: 5000,
  });

  const [listenerId] = useState(() => {
    const stored = localStorage.getItem(`jukboks_listener_id`);
    if (stored) return stored;
    const newId = `listener_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(`jukboks_listener_id`, newId);
    return newId;
  });

  useEffect(() => {
    if (!venueCode || !isListening) return;
    const savedName = localStorage.getItem(`jukboks_guest_name_${venueCode}`) || "Anonymous";
    registerListener(venueCode, listenerId, savedName).catch(() => {});
    const interval = setInterval(() => {
      registerListener(venueCode, listenerId, savedName).catch(() => {});
    }, 25000);
    return () => {
      clearInterval(interval);
      unregisterListener(venueCode, listenerId).catch(() => {});
    };
  }, [venueCode, isListening, listenerId]);

  useEffect(() => {
    if (!isListening || !party?.nowPlaying?.trackId) return;
    if (party.nowPlaying.trackId !== listeningTrackId) {
      setListeningTrackId(party.nowPlaying.trackId);
      playSong(party.nowPlaying.trackId);
    }
  }, [isListening, party?.nowPlaying?.trackId, listeningTrackId, playSong]);

  const [guestId, setGuestId] = useState<number | null>(() => {
    const saved = localStorage.getItem(`jukboks_guest_id_${venueCode}`);
    return saved ? parseInt(saved) : null;
  });

  const joinMutation = useMutation({
    mutationFn: (name: string) => joinParty(venueCode, name),
    onSuccess: (data: any) => {
      if (data.sessionToken) {
        setGuestToken(data.sessionToken);
        setGuestId(data.guestId);
        localStorage.setItem(`jukboks_guest_${venueCode}`, data.sessionToken);
        localStorage.setItem(`jukboks_guest_name_${venueCode}`, guestName);
        localStorage.setItem(`jukboks_guest_id_${venueCode}`, String(data.guestId));
        setSavedGuestName(guestName);
        setShowJoinForm(false);
      }
    },
  });

  const requestMutation = useMutation({
    mutationFn: (track: Track) =>
      submitRequest(venueCode, {
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumCover: track.albumCover,
        duration: track.duration,
        isExplicit: track.isExplicit,
        previewUrl: track.previewUrl,
      }, guestToken || undefined),
    onSuccess: (_data: any, track: Track) => {
      queryClient.invalidateQueries({ queryKey: ["party", venueCode] });
      setActiveTab("queue");
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
      submitVote(venueCode, requestId, voteType, guestToken || undefined),
    onSuccess: (_, variables) => {
      setUserVotes(prev => new Map(prev).set(variables.requestId, variables.voteType));
      queryClient.invalidateQueries({ queryKey: ["party", venueCode] });
    },
  });

  const handleListenAlong = useCallback(async () => {
    if (isListening) {
      setIsListening(false);
      setListeningTrackId(null);
      stop();
      return;
    }
    if (!isAuthorized) {
      await authorize();
    }
    setIsListening(true);
  }, [isListening, isAuthorized, authorize, stop]);

  if (showJoinForm) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6">
        <button onClick={onLeave} className="absolute top-12 left-4 p-2 text-gray-400">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6">
          <Music2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Join the Party</h1>
        <p className="text-gray-400 mb-8 text-center text-sm">Enter your name to start requesting songs</p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (guestName.trim()) joinMutation.mutate(guestName.trim()); }}
          className="w-full max-w-sm space-y-4"
        >
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your name"
            autoFocus
            className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white text-center text-lg placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!guestName.trim() || joinMutation.isPending}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl text-white font-bold text-lg disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {joinMutation.isPending ? "Joining..." : "Join"}
          </button>
        </form>
      </div>
    );
  }

  const nowPlaying = party?.nowPlaying;
  const partyQueue = party?.queue;
  const queue = Array.isArray(partyQueue) ? partyQueue : (partyQueue?.items || []);
  const brandColor = party?.branding?.primaryColor || "#6366f1";
  const queueTrackIds = new Set([
    ...queue.map((item: any) => item.trackId),
    ...(nowPlaying?.trackId ? [nowPlaying.trackId] : []),
  ]);

  return (
    <div className="flex flex-col h-screen bg-transparent" style={{ "--brand-color": brandColor } as React.CSSProperties}>
      <ConnectionStatus isError={partyError} isLoading={partyLoading} />
      {nowPlaying && activeTab !== "playing" && (
        <div className="p-4 bg-black/30 backdrop-blur-lg border-b border-white/10">
          <div className="flex items-center gap-3">
            {nowPlaying.albumCover && (
              <img src={nowPlaying.albumCover} alt="" className="w-14 h-14 rounded-lg shadow-lg" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-indigo-400 font-medium">NOW PLAYING</p>
              <p className="text-white font-bold truncate">{nowPlaying.title}</p>
              <p className="text-gray-400 text-sm truncate">{nowPlaying.artist}</p>
            </div>
            {isListening && (
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === "playing" && (
          <div>
            {nowPlaying ? (
              <div className="flex flex-col items-center mb-6">
                <div className="relative mb-4">
                  {nowPlaying.albumCover ? (
                    <>
                      <div className="absolute inset-0 bg-indigo-500/20 rounded-2xl blur-2xl" />
                      <img
                        src={nowPlaying.albumCover}
                        alt={nowPlaying.title}
                        className="relative w-56 h-56 rounded-2xl object-cover shadow-2xl"
                      />
                    </>
                  ) : (
                    <div className="w-56 h-56 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-2xl">
                      <Music2 className="w-20 h-20 text-white/50" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-indigo-400 font-medium mb-1">NOW PLAYING</p>
                <h2 className="text-xl font-bold text-white text-center px-4">{nowPlaying.title}</h2>
                <p className="text-gray-400 text-center">{nowPlaying.artist}</p>
                <button
                  onClick={handleListenAlong}
                  className={`mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                    isListening
                      ? "bg-red-500/20 text-red-400 border border-red-500/40"
                      : "text-white hover:opacity-90"
                  }`}
                  style={!isListening ? { background: `linear-gradient(to right, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #7c3aed))` } : undefined}
                >
                  <Headphones className="w-4 h-4" />
                  {isListening ? "Stop Listening" : "Listen Along"}
                </button>
                {isListening && (
                  <p className="text-xs text-green-400 flex items-center gap-1 mt-2">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Synced with venue
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-12">
                <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center mb-4">
                  <Music2 className="w-12 h-12 text-gray-500" />
                </div>
                <p className="text-gray-400 font-medium">Nothing playing</p>
                <p className="text-gray-500 text-sm mt-1">Waiting for a song...</p>
              </div>
            )}

            {queue.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Up Next</h3>
                <div className="space-y-2">
                  {queue.slice(0, 5).map((song: any, i: number) => {
                    const userVote = userVotes.get(song.id);
                    const isYourSong = guestId != null && song.requestedByGuestId === guestId;
                    return (
                      <div key={song.id} className={`flex items-center gap-3 p-3 bg-white/5 rounded-xl ${isYourSong ? "border border-indigo-500/30" : ""}`}>
                        {song.albumCover ? (
                          <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                            <Music2 className="w-5 h-5 text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate text-sm">{song.title}</p>
                          <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                          {isYourSong && (
                            <span className="text-[10px] text-indigo-300 font-semibold">Your song — #{i + 1}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => voteMutation.mutate({ requestId: song.id, voteType: "up" })}
                            className={`p-2 rounded-lg transition-colors ${
                              userVote === "up" ? "bg-green-600/20 text-green-400" : "text-gray-500 hover:text-green-400"
                            }`}
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <span className="text-white text-xs font-medium min-w-[16px] text-center">
                            {(song.upvotes || 0) - (song.downvotes || 0)}
                          </span>
                          <button
                            onClick={() => voteMutation.mutate({ requestId: song.id, voteType: "down" })}
                            className={`p-2 rounded-lg transition-colors ${
                              userVote === "down" ? "bg-red-600/20 text-red-400" : "text-gray-500 hover:text-red-400"
                            }`}
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {queue.length > 5 && (
                    <button
                      onClick={() => setActiveTab("queue")}
                      className="w-full py-2 text-center text-indigo-400 text-sm font-medium"
                    >
                      View all {queue.length} songs in queue
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <div>
            <h2 className="text-lg font-bold text-white mb-3">Request a Song</h2>
            <SongSearch
              onSelect={(track) => requestMutation.mutate(track)}
              allowExplicit={party?.venue?.allowExplicit || false}
              blockHolidayMusic={party?.venue?.blockHolidayMusic || false}
              queueTrackIds={queueTrackIds}
            />
            {requestError && (
              <div className="mt-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                {requestError}
              </div>
            )}

            {favorites.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Your Favorites</h3>
                <div className="space-y-2">
                  {favorites.slice(0, 8).map((song) => {
                    const inQueue = queueTrackIds.has(song.trackId);
                    return (
                      <div key={song.trackId} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
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
          </div>
        )}

        {activeTab === "queue" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white mb-3">Queue ({queue.length})</h2>
            {queue.map((song: any, i: number) => {
              const isYourSong = guestId != null && song.requestedByGuestId === guestId;
              return (
                <div key={song.id} className={`flex items-center gap-3 p-3 bg-white/5 rounded-xl ${isYourSong ? "border border-indigo-500/30" : ""}`}>
                  <span className={`text-sm font-mono w-6 text-center ${isYourSong ? "text-indigo-400 font-bold" : "text-gray-500"}`}>{i + 1}</span>
                  {song.albumCover && (
                    <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate text-sm">{song.title}</p>
                    <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                    {isYourSong && (
                      <span className="text-[10px] text-indigo-300 font-semibold">Your song</span>
                    )}
                  </div>
                  <span className="text-indigo-400 text-xs font-medium">
                    {(song.upvotes || 0) - (song.downvotes || 0)} votes
                  </span>
                </div>
              );
            })}

            {party?.recentlyPlayed && party.recentlyPlayed.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-bold text-white mb-3">Recently Played</h2>
                {party.recentlyPlayed.slice(0, 10).map((song: any) => (
                  <div key={song.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl mb-2">
                    {song.albumCover ? (
                      <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg opacity-60" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
                        <Music2 className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 font-medium truncate text-sm">{song.title}</p>
                      <p className="text-gray-500 text-xs truncate">{song.artist}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 px-6 py-2 pb-8">
        <div className="flex justify-around">
          {[
            { id: "playing" as GuestTab, icon: Radio, label: "Now Playing" },
            { id: "search" as GuestTab, icon: Search, label: "Search" },
            { id: "queue" as GuestTab, icon: ListMusic, label: "Queue" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
                activeTab === tab.id ? "text-indigo-400" : "text-gray-500"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
