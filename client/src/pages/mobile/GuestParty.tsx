import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Search, ListMusic, Radio, ThumbsUp, ThumbsDown, ArrowLeft, Headphones } from "lucide-react";
import { fetchParty, joinParty, submitRequest, submitVote, registerListener, unregisterListener } from "../../lib/api";
import { SongSearch } from "../../components/SongSearch";
import { useMusicKit } from "../../hooks/useMusicKit";
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
  const [showJoinForm, setShowJoinForm] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Map<number, "up" | "down">>(new Map());
  const [isListening, setIsListening] = useState(false);
  const [listeningTrackId, setListeningTrackId] = useState<string | null>(null);
  
  const { isAuthorized, isPlaying, authorize, playSong, stop } = useMusicKit();

  useEffect(() => {
    const savedToken = localStorage.getItem(`jukboks_guest_${venueCode}`);
    if (savedToken) {
      setGuestToken(savedToken);
      setShowJoinForm(false);
    }
  }, [venueCode]);

  const { data: party } = useQuery({
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

  const joinMutation = useMutation({
    mutationFn: (name: string) => joinParty(venueCode, name),
    onSuccess: (data: any) => {
      if (data.sessionToken) {
        setGuestToken(data.sessionToken);
        localStorage.setItem(`jukboks_guest_${venueCode}`, data.sessionToken);
        localStorage.setItem(`jukboks_guest_name_${venueCode}`, guestName);
        setShowJoinForm(false);
      }
    },
  });

  const requestMutation = useMutation({
    mutationFn: (track: Track) =>
      submitRequest(venueCode, {
        trackId: track.id,
        title: track.name,
        artist: track.artistName,
        albumCover: track.artworkUrl100,
        previewUrl: track.previewUrl,
        duration: track.durationInMillis ? Math.round(track.durationInMillis / 1000) : undefined,
      }, guestToken || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["party", venueCode] });
      setActiveTab("queue");
      setRequestError(null);
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

  return (
    <div className="flex flex-col h-screen bg-transparent">
      {nowPlaying && (
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
            <button
              onClick={handleListenAlong}
              className={`p-2.5 rounded-full transition-colors ${
                isListening
                  ? "bg-indigo-600 text-white"
                  : "bg-white/10 text-gray-400 hover:text-white"
              }`}
            >
              <Headphones className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === "playing" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white mb-3">Up Next</h2>
            {queue.length === 0 ? (
              <div className="text-center py-12">
                <Music2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Queue is empty</p>
                <p className="text-gray-500 text-sm">Be the first to request a song!</p>
              </div>
            ) : (
              queue.map((song: any) => {
                const userVote = userVotes.get(song.id);
                return (
                  <div key={song.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                    {song.albumCover && (
                      <img src={song.albumCover} alt="" className="w-12 h-12 rounded-lg" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate text-sm">{song.title}</p>
                      <p className="text-gray-400 text-xs truncate">{song.artist}</p>
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
                      <span className="text-white text-sm font-medium min-w-[20px] text-center">
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
              })
            )}
          </div>
        )}

        {activeTab === "search" && (
          <div>
            <h2 className="text-lg font-bold text-white mb-3">Request a Song</h2>
            <SongSearch
              onSelect={(track) => requestMutation.mutate(track)}
              isSubmitting={requestMutation.isPending}
              submitSuccess={requestMutation.isSuccess}
              venueCode={venueCode}
            />
            {requestError && (
              <div className="mt-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                {requestError}
              </div>
            )}
          </div>
        )}

        {activeTab === "queue" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white mb-3">Queue ({queue.length})</h2>
            {queue.map((song: any, i: number) => (
              <div key={song.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <span className="text-gray-500 text-sm font-mono w-6 text-center">{i + 1}</span>
                {song.albumCover && (
                  <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate text-sm">{song.title}</p>
                  <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                </div>
                <span className="text-indigo-400 text-xs font-medium">
                  {(song.upvotes || 0) - (song.downvotes || 0)} votes
                </span>
              </div>
            ))}
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
