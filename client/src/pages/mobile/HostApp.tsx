import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, ListMusic, Settings, Building2, LogOut, ArrowLeft, Clock, SkipForward, Trash2, Users } from "lucide-react";
import { fetchMyVenues, fetchVenue, fetchQueue, updateVenue, skipSong, fetchKioskStatus, clearQueue, fetchListeners } from "../../lib/api";
import { useAuth } from "../../hooks/use-auth";

type HostTab = "venues" | "queue" | "settings";

interface HostAppProps {
  onSwitchRole: () => void;
}

export default function HostApp({ onSwitchRole }: HostAppProps) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<HostTab>("venues");
  const [selectedVenueCode, setSelectedVenueCode] = useState<string | null>(null);

  const { data: venues = [] } = useQuery({
    queryKey: ["my-venues"],
    queryFn: fetchMyVenues,
    enabled: isAuthenticated,
  });

  const { data: selectedVenue } = useQuery({
    queryKey: ["venue", selectedVenueCode],
    queryFn: () => fetchVenue(selectedVenueCode!),
    enabled: !!selectedVenueCode,
  });

  const { data: queueData } = useQuery({
    queryKey: ["queue", selectedVenueCode],
    queryFn: () => fetchQueue(selectedVenueCode!),
    enabled: !!selectedVenueCode,
    refetchInterval: 5000,
  });
  const queue = Array.isArray(queueData) ? queueData : (queueData?.items || []);

  const { data: kioskStatus } = useQuery({
    queryKey: ["kiosk-status", selectedVenueCode],
    queryFn: () => fetchKioskStatus(selectedVenueCode!),
    enabled: !!selectedVenueCode,
    refetchInterval: 30000,
  });

  const { data: listenersData } = useQuery({
    queryKey: ["listeners", selectedVenueCode],
    queryFn: () => fetchListeners(selectedVenueCode!),
    enabled: !!selectedVenueCode,
    refetchInterval: 15000,
  });

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const skipMutation = useMutation({
    mutationFn: () => {
      const playingItem = queue.find((s: any) => s.status === "playing") || queue[0];
      if (!playingItem) throw new Error("No song to skip");
      return skipSong(selectedVenueCode!, playingItem.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", selectedVenueCode] });
      queryClient.invalidateQueries({ queryKey: ["venue", selectedVenueCode] });
    },
  });

  const clearQueueMutation = useMutation({
    mutationFn: () => clearQueue(selectedVenueCode!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", selectedVenueCode] });
      queryClient.invalidateQueries({ queryKey: ["venue", selectedVenueCode] });
      setShowClearConfirm(false);
    },
  });

  useEffect(() => {
    if (venues.length > 0 && !selectedVenueCode) {
      setSelectedVenueCode(venues[0].code);
    }
  }, [venues, selectedVenueCode]);

  const updateVenueMutation = useMutation({
    mutationFn: (data: any) => updateVenue(selectedVenue!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venue", selectedVenueCode] });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6">
          <Music2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Host Login</h1>
        <p className="text-gray-400 mb-8 text-center text-sm">Sign in to manage your venues</p>
        <a
          href="/api/login"
          className="w-full max-w-sm py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl text-white font-bold text-lg text-center block active:scale-[0.98] transition-transform"
        >
          Sign In
        </a>
        <button onClick={onSwitchRole} className="mt-4 text-gray-500 text-sm">
          Switch to Guest Mode
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-transparent">
      <div className="bg-black/30 backdrop-blur-lg border-b border-white/10 px-4 py-3 pt-12">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Welcome back</p>
            <h1 className="text-lg font-bold text-white">{user?.firstName || "Host"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSwitchRole} className="p-2 text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={() => logout()} className="p-2 text-gray-400 hover:text-white">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
        {venues.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {venues.map((v: any) => (
              <button
                key={v.code}
                onClick={() => setSelectedVenueCode(v.code)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedVenueCode === v.code
                    ? "bg-indigo-600 text-white"
                    : "bg-white/10 text-gray-400"
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === "venues" && selectedVenue && (
          <div className="space-y-4">
            {kioskStatus?.offlineDuringSchedule && (
              <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-3 animate-pulse">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <p className="text-red-400 text-sm font-semibold">Kiosk Offline</p>
                </div>
                <p className="text-red-300/80 text-xs">
                  Your kiosk should be running now but isn't responding. Check the device.
                </p>
              </div>
            )}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-white">{selectedVenue.name}</h2>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${kioskStatus?.isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-xs text-gray-400">
                    {kioskStatus?.isOnline
                      ? kioskStatus?.playbackStatus === 'playing' ? 'Playing' : 'Online'
                      : 'Offline'
                    }
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-white">{queue.length}</p>
                  <p className="text-[10px] text-gray-400">In Queue</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-white">{selectedVenue.dailyRequestLimit === 0 ? "∞" : selectedVenue.dailyRequestLimit}</p>
                  <p className="text-[10px] text-gray-400">Req Limit</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-indigo-400">{selectedVenue.code}</p>
                  <p className="text-[10px] text-gray-400">Code</p>
                </div>
              </div>
            </div>

            {selectedVenue.currentlyPlayingTitle && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-xs text-indigo-400 font-medium mb-2">NOW PLAYING</p>
                <div className="flex items-center gap-3">
                  {selectedVenue.currentlyPlayingAlbumCover && (
                    <img src={selectedVenue.currentlyPlayingAlbumCover} alt="" className="w-14 h-14 rounded-lg" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{selectedVenue.currentlyPlayingTitle}</p>
                    <p className="text-gray-400 text-sm truncate">{selectedVenue.currentlyPlayingArtist}</p>
                  </div>
                  <button
                    onClick={() => skipMutation.mutate()}
                    disabled={skipMutation.isPending}
                    className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-white disabled:opacity-50"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {(listenersData?.count > 0 || queue.length > 0) && (
              <div className="flex gap-3">
                {listenersData?.count > 0 && (
                  <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/10 flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-400" />
                    <span className="text-white text-sm font-medium">{listenersData.count}</span>
                    <span className="text-gray-400 text-xs">listening</span>
                  </div>
                )}
                {queue.length > 0 && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear Queue
                  </button>
                )}
              </div>
            )}

            {showClearConfirm && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-white text-sm font-medium mb-1">Clear entire queue?</p>
                <p className="text-gray-400 text-xs mb-3">This will remove all {queue.length} pending songs.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => clearQueueMutation.mutate()}
                    disabled={clearQueueMutation.isPending}
                    className="flex-1 py-2 bg-red-600 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  >
                    {clearQueueMutation.isPending ? "Clearing..." : "Yes, Clear"}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-2 bg-white/10 rounded-lg text-white text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-white">Quick Settings</h3>
              <div className="space-y-2">
                {[
                  { label: "Auto-Approve", key: "autoApprove", value: selectedVenue.autoApprove },
                  { label: "Allow Explicit", key: "allowExplicit", value: selectedVenue.allowExplicit },
                  { label: "Active", key: "isActive", value: selectedVenue.isActive },
                ].map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <span className="text-white text-sm">{setting.label}</span>
                    <button
                      onClick={() => updateVenueMutation.mutate({ [setting.key]: !setting.value })}
                      className={`w-12 h-7 rounded-full transition-colors relative ${
                        setting.value ? "bg-indigo-600" : "bg-white/20"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-transform ${
                        setting.value ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "queue" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Queue ({queue.length})</h2>
            {queue.length === 0 ? (
              <div className="text-center py-12">
                <ListMusic className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Queue is empty</p>
              </div>
            ) : (
              queue.map((song: any, i: number) => (
                <div key={song.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  <span className="text-gray-500 text-xs font-mono w-5 text-center">{i + 1}</span>
                  {song.albumCover && (
                    <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate text-sm">{song.title}</p>
                    <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                    <p className="text-gray-500 text-[10px]">
                      {song.guestName || "Unknown"} · {(song.upvotes || 0) - (song.downvotes || 0)} votes
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    song.status === "approved" ? "bg-green-600/20 text-green-400" : "bg-yellow-600/20 text-yellow-400"
                  }`}>
                    {song.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "settings" && selectedVenue && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Venue Settings</h2>
            
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-4">
              <div>
                <label className="text-white text-sm mb-1 block">Daily Request Limit</label>
                <select
                  value={selectedVenue.dailyRequestLimit || 5}
                  onChange={(e) => updateVenueMutation.mutate({ dailyRequestLimit: parseInt(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n} per guest</option>
                  ))}
                  <option value="0">Unlimited</option>
                </select>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Kiosk Status
              </h3>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  kioskStatus?.isOnline 
                    ? kioskStatus?.playbackStatus === 'playing' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                    : 'bg-red-500'
                }`} />
                <div>
                  <p className="text-white text-sm">
                    {kioskStatus?.isOnline 
                      ? kioskStatus?.playbackStatus === 'playing' ? 'Playing' : 'Online'
                      : 'Offline'}
                  </p>
                  {kioskStatus?.deviceName && (
                    <p className="text-gray-400 text-xs">{kioskStatus.deviceName}</p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => window.open(`/admin/settings`, '_blank')}
              className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 text-sm font-medium"
            >
              Open Full Settings
            </button>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 px-6 py-2 pb-8">
        <div className="flex justify-around">
          {[
            { id: "venues" as HostTab, icon: Building2, label: "Dashboard" },
            { id: "queue" as HostTab, icon: ListMusic, label: "Queue" },
            { id: "settings" as HostTab, icon: Settings, label: "Settings" },
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
