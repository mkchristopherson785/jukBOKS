import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Tv } from "lucide-react";
import { fetchParty, joinParty, submitRequest, submitVote } from "../lib/api";
import { SongSearch } from "../components/SongSearch";
import { QueueList } from "../components/QueueList";
import { NowPlaying } from "../components/NowPlaying";
import type { Track } from "../hooks/useAppleMusic";

export default function PartyPage() {
  const { code } = useParams<{ code: string }>();
  const queryClient = useQueryClient();
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [showJoinForm, setShowJoinForm] = useState(true);
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set());

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

  const joinMutation = useMutation({
    mutationFn: () => joinParty(code!, guestName),
    onSuccess: (data) => {
      setGuestToken(data.sessionToken);
      localStorage.setItem(`jukboks_guest_${code}`, data.sessionToken);
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
        },
        guestToken || undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["party", code] });
    },
  });

  const voteMutation = useMutation({
    mutationFn: (requestId: number) =>
      submitVote(party?.venue?.code || code!, requestId, guestToken || undefined),
    onSuccess: (_, requestId) => {
      setVotedIds((prev) => new Set([...prev, requestId]));
      queryClient.invalidateQueries({ queryKey: ["party", code] });
    },
  });

  if (showJoinForm) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Music2 className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Jukboks</span>
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !party) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Party Not Found</h2>
          <p className="text-gray-400">This party may have ended or the code is invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
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
          <a
            href={`/kiosk/${party.venue?.code}`}
            className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            title="Kiosk Mode"
          >
            <Tv className="w-5 h-5 text-gray-300" />
          </a>
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
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Request a Song</h2>
          <SongSearch
            onSelect={(track) => requestMutation.mutate(track)}
            allowExplicit={party.venue?.allowExplicit || false}
          />
          {requestMutation.isError && (
            <p className="text-red-400 text-sm mt-2">Failed to add song. Please try again.</p>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Up Next</h2>
          <QueueList
            items={party.queue || []}
            onVote={(requestId) => voteMutation.mutate(requestId)}
            votedIds={votedIds}
          />
        </div>
      </main>
    </div>
  );
}
