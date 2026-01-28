import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Settings, QrCode, Tv, ExternalLink, LogOut, User, Plus, MapPin, Users, Trash2, Mail, ListMusic, X, Copy, Check, Radio } from "lucide-react";
import { fetchVenue, fetchQueue, fetchQRCode, fetchMyVenues, createVenue, fetchTeam, inviteTeamMember, removeTeamMember, updateVenue, deleteVenue, fetchBackupPlaylists, addBackupPlaylist, removeBackupPlaylist, fetchListeners } from "../lib/api";
import { QueueList } from "../components/QueueList";
import { useAuth } from "../hooks/use-auth";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [selectedVenueCode, setSelectedVenueCode] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [activeTab, setActiveTab] = useState<"venues" | "team">("venues");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistError, setPlaylistError] = useState("");
  const [copied, setCopied] = useState(false);

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

  const { data: qrData } = useQuery({
    queryKey: ["qrcode", selectedVenueCode],
    queryFn: () => fetchQRCode(selectedVenueCode!),
    enabled: !!selectedVenueCode,
  });

  const { data: listenersData } = useQuery({
    queryKey: ["listeners", selectedVenueCode],
    queryFn: () => fetchListeners(selectedVenueCode!),
    enabled: !!selectedVenueCode,
    refetchInterval: 10000,
  });

  const createVenueMutation = useMutation({
    mutationFn: createVenue,
    onSuccess: (newVenue) => {
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
      setSelectedVenueCode(newVenue.code);
      setShowCreateModal(false);
      setNewVenueName("");
    },
  });

  const handleCreateVenue = () => {
    if (newVenueName.trim()) {
      createVenueMutation.mutate({ name: newVenueName.trim() });
    }
  };

  const { data: teamData } = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeam,
    enabled: isAuthenticated,
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteTeamMember(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteError("");
    },
    onError: (error: any) => {
      setInviteError(error.message);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ venueId, data }: { venueId: number; data: any }) => updateVenue(venueId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venue", selectedVenueCode] });
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
    },
  });

  const { data: backupPlaylists = [] } = useQuery({
    queryKey: ["backupPlaylists", selectedVenueCode],
    queryFn: () => fetchBackupPlaylists(selectedVenueCode!),
    enabled: !!selectedVenueCode,
  });

  const addPlaylistMutation = useMutation({
    mutationFn: (url: string) => addBackupPlaylist(selectedVenue?.id!, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenueCode] });
      setShowPlaylistModal(false);
      setPlaylistUrl("");
      setPlaylistError("");
    },
    onError: (error: any) => {
      setPlaylistError(error.message);
    },
  });

  const removePlaylistMutation = useMutation({
    mutationFn: (playlistId: string) => removeBackupPlaylist(selectedVenue?.id!, playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenueCode] });
    },
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: number) => deleteVenue(venueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
      setSelectedVenueCode(null);
    },
  });

  const handleDeleteVenue = (venueId: number, venueName: string) => {
    if (confirm(`Are you sure you want to delete "${venueName}"? This will permanently remove all requests, playlists, and party data for this venue.`)) {
      deleteVenueMutation.mutate(venueId);
    }
  };

  const handleSettingChange = (field: string, value: any) => {
    if (selectedVenue) {
      updateVenueMutation.mutate({ venueId: selectedVenue.id, data: { [field]: value } });
    }
  };

  const handleAddPlaylist = () => {
    if (playlistUrl.trim()) {
      setPlaylistError("");
      addPlaylistMutation.mutate(playlistUrl.trim());
    }
  };

  const handleInvite = () => {
    if (inviteEmail.trim()) {
      setInviteError("");
      inviteMutation.mutate(inviteEmail.trim());
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 backdrop-blur-lg bg-black/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Music2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-white">Jukboks</span>
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
            <a
              href="/api/logout"
              className="px-3 py-2 text-gray-300 hover:text-white font-medium transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab("venues")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === "venues" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            <MapPin className="w-5 h-5" />
            Venues
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === "team" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            <Users className="w-5 h-5" />
            Team
          </button>
        </div>

        {activeTab === "venues" && (
          <>
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-bold text-white">My Venues</h1>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                New Venue
              </button>
            </div>

        {venuesLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : venues.length === 0 ? (
          <div className="text-center py-20">
            <MapPin className="w-16 h-16 mx-auto text-gray-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">No Venues Yet</h2>
            <p className="text-gray-400 mb-6">Create your first venue to start hosting music parties</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Your First Venue
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              {venues.map((venue: any) => (
                <div
                  key={venue.id}
                  className={`w-full p-4 rounded-xl transition-colors ${
                    selectedVenueCode === venue.code
                      ? "bg-indigo-600/30 border border-indigo-500"
                      : "bg-white/5 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectedVenueCode(venue.code)}
                      className="flex-1 text-left"
                    >
                      <p className="text-white font-medium">{venue.name}</p>
                      <p className="text-gray-400 text-sm font-mono">{venue.code}</p>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVenue(venue.id, venue.name);
                      }}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete venue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {selectedVenue && (
              <div className="lg:col-span-3 space-y-6">
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      {selectedVenue.name} Settings
                    </h2>
                    <a
                      href={`/kiosk/${selectedVenueCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                      <Tv className="w-5 h-5" />
                      Open Kiosk
                    </a>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-white/5 rounded-xl">
                      <label className="text-gray-400 text-sm block mb-2">Limit in Queue</label>
                      <select
                        value={selectedVenue.dailyRequestLimit === 0 ? "unlimited" : selectedVenue.dailyRequestLimit}
                        onChange={(e) => handleSettingChange("dailyRequestLimit", e.target.value === "unlimited" ? 0 : parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n} className="bg-gray-900">{n} {n === 1 ? "request" : "requests"}</option>
                        ))}
                        <option value="unlimited" className="bg-gray-900">Unlimited</option>
                      </select>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl">
                      <label className="text-gray-400 text-sm block mb-2">Explicit Content</label>
                      <button
                        onClick={() => handleSettingChange("allowExplicit", !selectedVenue.allowExplicit)}
                        className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                          selectedVenue.allowExplicit
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-red-600/30 hover:bg-red-600/50 text-red-300"
                        }`}
                      >
                        {selectedVenue.allowExplicit ? "Allowed" : "Blocked"}
                      </button>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl">
                      <label className="text-gray-400 text-sm block mb-2">Auto-Approve</label>
                      <button
                        onClick={() => handleSettingChange("autoApprove", !selectedVenue.autoApprove)}
                        className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                          selectedVenue.autoApprove
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-gray-600/30 hover:bg-gray-600/50 text-gray-300"
                        }`}
                      >
                        {selectedVenue.autoApprove ? "On" : "Off"}
                      </button>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl">
                      <label className="text-gray-400 text-sm block mb-2">Status</label>
                      <button
                        onClick={() => handleSettingChange("isActive", !selectedVenue.isActive)}
                        className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                          selectedVenue.isActive
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-gray-600/30 hover:bg-gray-600/50 text-gray-300"
                        }`}
                      >
                        {selectedVenue.isActive ? "Active" : "Inactive"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Quick Links</h3>
                    <div className="space-y-3">
                      <a
                        href={qrData?.partyUrl || `/party/${selectedVenueCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-indigo-600/20 rounded-xl hover:bg-indigo-600/30 transition-colors"
                      >
                        <QrCode className="w-6 h-6 text-indigo-400" />
                        <div className="flex-1">
                          <p className="text-white font-medium">Party Page</p>
                          <p className="text-gray-400 text-sm">Share with guests</p>
                        </div>
                        <ExternalLink className="w-5 h-5 text-gray-400" />
                      </a>
                      <a
                        href={`/kiosk/${selectedVenueCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-purple-600/20 rounded-xl hover:bg-purple-600/30 transition-colors"
                      >
                        <Tv className="w-6 h-6 text-purple-400" />
                        <div className="flex-1">
                          <p className="text-white font-medium">Kiosk Display</p>
                          <p className="text-gray-400 text-sm">Now playing screen</p>
                        </div>
                        <ExternalLink className="w-5 h-5 text-gray-400" />
                      </a>
                    </div>
                  </div>

                  {qrData?.qrCode && (
                    <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                      <h3 className="text-lg font-bold text-white mb-4">QR Code</h3>
                      <div className="bg-white rounded-2xl p-4 flex flex-col items-center">
                        <img src={qrData.qrCode} alt="Party QR Code" className="w-40 h-40" />
                        <p className="text-gray-600 text-sm mt-2 text-center">Scan to join</p>
                      </div>
                      <div className="mt-4">
                        <p className="text-gray-400 text-sm mb-2">Or share this link:</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`${window.location.origin}/party/${qrData.partyCode || selectedVenueCode}`}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/party/${qrData.partyCode || selectedVenueCode}`);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1"
                          >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <Radio className="w-5 h-5 text-purple-400" />
                      Live Listeners
                    </h3>
                    {listenersData?.count > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-green-400 font-semibold">{listenersData.count}</span>
                          <span className="text-gray-400">
                            {listenersData.count === 1 ? "person" : "people"} listening live
                          </span>
                        </div>
                        <div className="space-y-2">
                          {listenersData.listeners.map((listener: { id: string; name: string }) => (
                            <div key={listener.id} className="flex items-center gap-2 text-sm text-gray-400">
                              <User className="w-4 h-4" />
                              {listener.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        No one is listening live right now. Guests can tap "Listen Live" on the party page to sync their playback.
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <ListMusic className="w-5 h-5" />
                      Backup Playlists
                    </h3>
                    <button
                      onClick={() => setShowPlaylistModal(true)}
                      disabled={backupPlaylists.length >= 10}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      Add Playlist
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm mb-4">
                    When the queue is empty, songs will auto-play from these playlists. ({backupPlaylists.length}/10)
                  </p>
                  {backupPlaylists.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No backup playlists added yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {backupPlaylists.map((playlist: any) => (
                        <div key={playlist.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                          {playlist.artworkUrl && (
                            <img src={playlist.artworkUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{playlist.name || "Apple Music Playlist"}</p>
                            <p className="text-gray-400 text-sm truncate">{playlist.trackCount || 0} tracks</p>
                          </div>
                          <button
                            onClick={() => removePlaylistMutation.mutate(playlist.id.toString())}
                            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                            title="Remove playlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Queue ({queue?.items?.length || 0} songs)</h3>
                  <QueueList items={queue?.items || []} />
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {activeTab === "team" && (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-bold text-white">Team Members</h1>
              {teamData?.isOwner && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Invite Member
                </button>
              )}
            </div>

            <p className="text-gray-400 mb-6">
              Team members can view and manage all venues in your organization.
            </p>

            <div className="space-y-4">
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{user?.email}</p>
                  <p className="text-gray-400 text-sm">Owner</p>
                </div>
              </div>

              {teamData?.members?.map((member: any) => (
                <div key={member.id} className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-gray-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{member.email}</p>
                    <p className="text-gray-400 text-sm">
                      {member.joinedAt ? "Admin" : "Invited (pending)"}
                    </p>
                  </div>
                  {teamData?.isOwner && (
                    <button
                      onClick={() => removeMemberMutation.mutate(member.id)}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                      title="Remove member"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}

              {(!teamData?.members || teamData.members.length === 0) && (
                <p className="text-gray-500 text-center py-8">
                  No team members yet. Invite people to help manage your venues.
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Create New Venue</h2>
            <input
              type="text"
              value={newVenueName}
              onChange={(e) => setNewVenueName(e.target.value)}
              placeholder="Venue name (e.g., Downtown Bar)"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewVenueName("");
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVenue}
                disabled={!newVenueName.trim() || createVenueMutation.isPending}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {createVenueMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Invite Team Member</h2>
            <p className="text-gray-400 mb-4">
              Enter their email address. They'll be able to manage all your venues once they sign in.
            </p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-2"
              autoFocus
            />
            {inviteError && (
              <p className="text-red-400 text-sm mb-4">{inviteError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail("");
                  setInviteError("");
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {inviteMutation.isPending ? "Inviting..." : "Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Add Backup Playlist</h2>
            <p className="text-gray-400 mb-4">
              Paste an Apple Music playlist URL. Songs from this playlist will auto-play when the queue is empty.
            </p>
            <input
              type="text"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="https://music.apple.com/us/playlist/..."
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-2"
              autoFocus
            />
            {playlistError && (
              <p className="text-red-400 text-sm mb-4">{playlistError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowPlaylistModal(false);
                  setPlaylistUrl("");
                  setPlaylistError("");
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPlaylist}
                disabled={!playlistUrl.trim() || addPlaylistMutation.isPending}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {addPlaylistMutation.isPending ? "Adding..." : "Add Playlist"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
