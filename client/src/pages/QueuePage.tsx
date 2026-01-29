import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, LogOut, User, Shield, SkipForward, History, Ban, X, Music } from "lucide-react";
import { fetchMyVenues, fetchVenue, fetchQueue, fetchListeners, fetchPlayHistory, fetchBannedSongs, banSong, unbanSong, skipSong, checkSuperAdmin } from "../lib/api";
import { QueueList } from "../components/QueueList";
import { useAuth } from "../hooks/use-auth";

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const urlParams = new URLSearchParams(search);
  const venueFromUrl = urlParams.get("venue");
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });
  
  const [selectedVenueCode, setSelectedVenueCode] = useState<string | null>(venueFromUrl);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["myVenues"],
    queryFn: fetchMyVenues,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (venues.length > 0 && !selectedVenueCode) {
      setSelectedVenueCode(venues[0].code);
    }
  }, [venues, selectedVenueCode]);

  const { data: selectedVenue } = useQuery({
    queryKey: ["venue", selectedVenueCode],
    queryFn: () => fetchVenue(selectedVenueCode!),
    enabled: !!selectedVenueCode,
  });

  const { data: queue } = useQuery({
    queryKey: ["queue", selectedVenueCode],
    queryFn: () => fetchQueue(selectedVenueCode!),
    enabled: !!selectedVenueCode,
    refetchInterval: 5000,
  });

  const { data: listenersData } = useQuery({
    queryKey: ["listeners", selectedVenueCode],
    queryFn: () => fetchListeners(selectedVenueCode!),
    enabled: !!selectedVenueCode,
    refetchInterval: 10000,
  });

  const { data: playHistory = [] } = useQuery({
    queryKey: ["playHistory", selectedVenue?.id],
    queryFn: () => fetchPlayHistory(selectedVenue?.id!),
    enabled: !!selectedVenue?.id,
  });

  const { data: bannedSongs = [] } = useQuery({
    queryKey: ["bannedSongs", selectedVenue?.id],
    queryFn: () => fetchBannedSongs(selectedVenue?.id!),
    enabled: !!selectedVenue?.id,
  });

  const skipSongMutation = useMutation({
    mutationFn: (requestId: number) => skipSong(selectedVenueCode!, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", selectedVenueCode] });
      queryClient.invalidateQueries({ queryKey: ["playHistory", selectedVenue?.id] });
    },
  });

  const banSongMutation = useMutation({
    mutationFn: (song: { trackId: string; title: string; artist: string; albumCover?: string }) => banSong(selectedVenue?.id!, song),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bannedSongs", selectedVenue?.id] });
    },
  });

  const unbanSongMutation = useMutation({
    mutationFn: (trackId: string) => unbanSong(selectedVenue?.id!, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bannedSongs", selectedVenue?.id] });
    },
  });

  if (authLoading || venuesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      <header className="border-b border-white/10 backdrop-blur-lg bg-black/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/admin")}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <a href="/" className="flex items-center">
              <img src="/assets/logo-full.png" alt="Jukboks" className="h-12" />
            </a>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-gray-300">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <User className="w-5 h-5" />
              )}
              <span className="hidden sm:inline">{user?.firstName || user?.email}</span>
            </div>
            {superAdminCheck?.isSuperAdmin && (
              <a href="/super-admin" className="px-3 py-2 text-amber-400 hover:text-amber-300 font-medium transition-colors" title="Super Admin">
                <Shield className="w-4 h-4" />
              </a>
            )}
            <a href="/api/logout" className="px-3 py-2 text-gray-300 hover:text-white font-medium transition-colors flex items-center gap-2">
              <LogOut className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-white">Queue</h1>
            {venues.length > 1 && (
              <select
                value={selectedVenueCode || ""}
                onChange={(e) => setSelectedVenueCode(e.target.value)}
                className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              >
                {venues.map((venue: any) => (
                  <option key={venue.id} value={venue.code} className="bg-gray-900">
                    {venue.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {listenersData?.count > 0 && (
            <div className="flex items-center gap-2 text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="font-semibold">{listenersData.count} listening</span>
            </div>
          )}
        </div>

        {!selectedVenue ? (
          <div className="text-center py-20">
            <Music className="w-16 h-16 mx-auto text-gray-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">No Venue Selected</h2>
            <p className="text-gray-400 mb-6">Create a venue first to manage its queue</p>
            <button
              onClick={() => setLocation("/admin/venues")}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Go to Venues
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">
                  {selectedVenue.name} - Queue ({queue?.items?.length || 0})
                </h2>
                {queue?.items?.[0] && (
                  <button
                    onClick={() => skipSongMutation.mutate(queue.items[0].id)}
                    disabled={skipSongMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    title="Skip current song"
                  >
                    <SkipForward className="w-4 h-4" />
                    Skip
                  </button>
                )}
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                <QueueList items={queue?.items || []} />
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                  <History className="w-5 h-5" />
                  Recent Plays
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {playHistory.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No play history yet</p>
                  ) : (
                    playHistory.slice(0, 10).map((song: any) => {
                      const isBanned = bannedSongs.some((b: any) => b.trackId === song.trackId);
                      return (
                        <div key={song.id} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                          <img src={song.albumCover || "/placeholder.svg"} alt="" className="w-10 h-10 rounded object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{song.title}</p>
                            <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                          </div>
                          <button
                            onClick={() => isBanned 
                              ? unbanSongMutation.mutate(song.trackId)
                              : banSongMutation.mutate({ trackId: song.trackId, title: song.title, artist: song.artist, albumCover: song.albumCover })
                            }
                            className={`p-2 rounded transition-colors ${isBanned ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-red-400'}`}
                            title={isBanned ? "Unban" : "Ban this song"}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {bannedSongs.length > 0 && (
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                    <Ban className="w-5 h-5 text-red-400" />
                    Banned Songs ({bannedSongs.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {bannedSongs.map((song: any) => (
                      <div key={song.id} className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg">
                        <span className="text-red-400 text-sm truncate flex-1">{song.title} - {song.artist}</span>
                        <button
                          onClick={() => unbanSongMutation.mutate(song.trackId)}
                          className="text-gray-400 hover:text-white transition-colors p-1"
                          title="Unban"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
