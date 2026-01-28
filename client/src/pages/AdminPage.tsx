import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Settings, QrCode, Tv, ExternalLink, LogOut, User, Plus, MapPin, Users, Trash2, Mail, ListMusic, X, Copy, Check, Radio, Volume2, Upload, SkipForward, History, Ban, Palette, Speaker, Link2, Unlink, Shield } from "lucide-react";
import { fetchVenue, fetchQueue, fetchQRCode, fetchMyVenues, createVenue, fetchTeam, inviteTeamMember, removeTeamMember, updateVenue, deleteVenue, fetchBackupPlaylists, addBackupPlaylist, removeBackupPlaylist, fetchListeners, fetchAnnouncements, createAnnouncement, deleteAnnouncement, updateAnnouncement, updateAnnouncementSettings, skipSong, fetchPlayHistory, fetchBannedSongs, banSong, unbanSong, fetchMyOrganization, updateOrganization, fetchSonosStatus, updateSonosSettings, disconnectSonos, getSonosConnectUrl, checkSuperAdmin, type Announcement, type SonosStatus } from "../lib/api";
import { useUpload } from "../hooks/use-upload";
import { QueueList } from "../components/QueueList";
import { useAuth } from "../hooks/use-auth";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });
  
  const [selectedVenueCode, setSelectedVenueCode] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [activeTab, setActiveTab] = useState<"venues" | "team" | "branding" | "settings">("venues");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistError, setPlaylistError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementName, setAnnouncementName] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const { uploadFile, isUploading } = useUpload({});

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: venues = [], isLoading: venuesLoading, isError: venuesError } = useQuery({
    queryKey: ["myVenues"],
    queryFn: fetchMyVenues,
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
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
    retry: false,
    throwOnError: false,
  });

  const { data: organization } = useQuery({
    queryKey: ["organization"],
    queryFn: fetchMyOrganization,
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
  });

  const updateOrgMutation = useMutation({
    mutationFn: updateOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization"] });
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
    },
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

  const { data: announcementsData } = useQuery({
    queryKey: ["announcements", selectedVenue?.id],
    queryFn: () => fetchAnnouncements(selectedVenue?.id!),
    enabled: !!selectedVenue?.id,
  });

  const announcements = announcementsData?.announcements || [];

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

  const { data: sonosStatus } = useQuery({
    queryKey: ["sonos", selectedVenue?.code],
    queryFn: () => fetchSonosStatus(selectedVenue?.code!),
    enabled: !!selectedVenue?.code,
    retry: false,
    throwOnError: false,
  });

  const updateSonosMutation = useMutation({
    mutationFn: (data: { groupId?: string; enabled?: boolean }) => updateSonosSettings(selectedVenue?.code!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonos", selectedVenue?.code] });
    },
  });

  const disconnectSonosMutation = useMutation({
    mutationFn: () => disconnectSonos(selectedVenue?.code!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sonos", selectedVenue?.code] });
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

  const createAnnouncementMutation = useMutation({
    mutationFn: (data: { name: string; audioUrl: string; duration?: number }) => createAnnouncement(selectedVenue?.id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", selectedVenue?.id] });
      setShowAnnouncementModal(false);
      setAnnouncementName("");
      setAnnouncementError("");
    },
    onError: (error: any) => {
      setAnnouncementError(error.message);
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: (announcementId: number) => deleteAnnouncement(selectedVenue?.id!, announcementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", selectedVenue?.id] });
    },
  });

  const toggleAnnouncementMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => updateAnnouncement(selectedVenue?.id!, id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", selectedVenue?.id] });
    },
  });

  const updateAnnouncementSettingsMutation = useMutation({
    mutationFn: (settings: { frequencyType?: string | null; frequency?: number; playMode?: string }) => 
      updateAnnouncementSettings(selectedVenue?.id!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venue", selectedVenueCode] });
    },
  });

  const handleAnnouncementUpload = async (file: File) => {
    if (!announcementName.trim()) {
      setAnnouncementError("Please enter a name for the announcement");
      return;
    }
    
    setAnnouncementError("");
    const result = await uploadFile(file);
    if (result) {
      createAnnouncementMutation.mutate({
        name: announcementName.trim(),
        audioUrl: result.objectPath,
      });
    }
  };

  const skipSongMutation = useMutation({
    mutationFn: (requestId: number) => skipSong(selectedVenueCode!, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue", selectedVenueCode] });
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

  if (authLoading || venuesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (venuesError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <div className="text-center text-white p-8">
          <h1 className="text-2xl font-bold mb-4">Unable to load venues</h1>
          <p className="text-gray-400 mb-6">There was a problem loading your data. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 backdrop-blur-lg bg-black/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
              <a
                href="/super-admin"
                className="px-3 py-2 text-amber-400 hover:text-amber-300 font-medium transition-colors flex items-center gap-2"
                title="Super Admin"
              >
                <Shield className="w-4 h-4" />
              </a>
            )}
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
        <div className="flex flex-wrap items-center gap-4 mb-8 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
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
            {teamData?.isOwner && (
              <button
                onClick={() => setActiveTab("branding")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === "branding" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <Palette className="w-5 h-5" />
                Branding
              </button>
            )}
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === "settings" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              <Settings className="w-5 h-5" />
              Settings
            </button>
          </div>

          {activeTab === "venues" && selectedVenue && (
            <>
              <div className="h-6 w-px bg-white/20 hidden sm:block" />
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={qrData?.partyUrl || `/party/${selectedVenueCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                >
                  <QrCode className="w-4 h-4" />
                  Party
                </a>
                <a
                  href={`/kiosk/${selectedVenueCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                >
                  <Tv className="w-4 h-4" />
                  Kiosk
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/party/${qrData?.partyCode || selectedVenueCode}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <div className="h-6 w-px bg-white/20 hidden sm:block" />
              <div className="relative">
                <button
                  onClick={() => setShowSettingsPopover(!showSettingsPopover)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                  {listenersData?.count > 0 && (
                    <span className="flex items-center gap-1 ml-1 text-green-400">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      {listenersData.count}
                    </span>
                  )}
                </button>
                {showSettingsPopover && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowSettingsPopover(false)} 
                    />
                    <div className="absolute top-full left-0 mt-2 w-64 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-gray-400 text-sm">Request Limit</label>
                        <select
                          value={selectedVenue.dailyRequestLimit === 0 ? "unlimited" : selectedVenue.dailyRequestLimit}
                          onChange={(e) => handleSettingChange("dailyRequestLimit", e.target.value === "unlimited" ? 0 : parseInt(e.target.value))}
                          className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n} className="bg-gray-900">{n}</option>
                          ))}
                          <option value="unlimited" className="bg-gray-900">∞</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-gray-400 text-sm">Allow Explicit</label>
                        <button
                          onClick={() => handleSettingChange("allowExplicit", !selectedVenue.allowExplicit)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            selectedVenue.allowExplicit
                              ? "bg-green-600/30 text-green-300"
                              : "bg-red-600/30 text-red-300"
                          }`}
                        >
                          {selectedVenue.allowExplicit ? "On" : "Off"}
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-gray-400 text-sm">Auto-Approve</label>
                        <button
                          onClick={() => handleSettingChange("autoApprove", !selectedVenue.autoApprove)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            selectedVenue.autoApprove
                              ? "bg-green-600/30 text-green-300"
                              : "bg-gray-600/30 text-gray-300"
                          }`}
                        >
                          {selectedVenue.autoApprove ? "On" : "Off"}
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-gray-400 text-sm">Venue Active</label>
                        <button
                          onClick={() => handleSettingChange("isActive", !selectedVenue.isActive)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            selectedVenue.isActive
                              ? "bg-green-600/30 text-green-300"
                              : "bg-gray-600/30 text-gray-300"
                          }`}
                        >
                          {selectedVenue.isActive ? "On" : "Off"}
                        </button>
                      </div>
                      <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Listening</span>
                        {listenersData?.count > 0 ? (
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="text-green-400 font-semibold">{listenersData.count}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm">0</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {activeTab === "venues" && (
          <>
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
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">My Venues</h2>
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
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-white/20 hover:border-indigo-500 hover:bg-white/5 text-gray-400 hover:text-white rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Venue
              </button>
            </div>

            {selectedVenue && (
              <div className="lg:col-span-3 space-y-4">
                {/* Main Content: Queue + Sidebar (Playlists + Announcements) */}
                <div className="grid lg:grid-cols-3 gap-4" style={{ maxHeight: 'calc(100vh - 280px)', minHeight: '400px' }}>
                  {/* Queue - Takes 2 columns */}
                  <div className="lg:col-span-2 bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-bold text-white">Queue ({queue?.items?.length || 0})</h3>
                      {queue?.items?.[0] && (
                        <button
                          onClick={() => skipSongMutation.mutate(queue.items[0].id)}
                          disabled={skipSongMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                          title="Skip current song"
                        >
                          <SkipForward className="w-4 h-4" />
                          Skip
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <QueueList items={queue?.items || []} />
                    </div>
                  </div>

                  {/* Right Sidebar - Play History */}
                  <div className="flex flex-col overflow-hidden">
                    {/* Play History & Banned Songs */}
                    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 flex flex-col flex-1 overflow-hidden">
                      <h3 className="text-md font-bold text-white flex items-center gap-2 mb-3">
                        <History className="w-4 h-4" />
                        Recent Plays
                      </h3>
                      <div className="space-y-2 flex-1 overflow-y-auto">
                        {playHistory.length === 0 ? (
                          <p className="text-gray-500 text-xs text-center py-2">No play history yet</p>
                        ) : (
                          playHistory.slice(0, 10).map((song: any) => {
                            const isBanned = bannedSongs.some((b: any) => b.trackId === song.trackId);
                            return (
                              <div key={song.id} className="flex items-center gap-2 p-2 bg-white/5 rounded">
                                <img src={song.albumCover || "/placeholder.svg"} alt="" className="w-8 h-8 rounded object-cover" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-xs font-medium truncate">{song.title}</p>
                                  <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                                </div>
                                <button
                                  onClick={() => isBanned 
                                    ? unbanSongMutation.mutate(song.trackId)
                                    : banSongMutation.mutate({ trackId: song.trackId, title: song.title, artist: song.artist, albumCover: song.albumCover })
                                  }
                                  className={`p-1.5 rounded transition-colors ${isBanned ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-red-400'}`}
                                  title={isBanned ? "Unban" : "Ban this song"}
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {bannedSongs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p className="text-xs text-gray-400 mb-2">Banned Songs ({bannedSongs.length})</p>
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {bannedSongs.map((song: any) => (
                              <div key={song.id} className="flex items-center gap-2 p-1.5 bg-red-500/10 rounded text-xs">
                                <span className="text-red-400 truncate flex-1">{song.title} - {song.artist}</span>
                                <button
                                  onClick={() => unbanSongMutation.mutate(song.trackId)}
                                  className="text-gray-400 hover:text-white transition-colors"
                                  title="Unban"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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

        {activeTab === "branding" && teamData?.isOwner && (
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-white mb-8">Branding Settings</h1>
            <p className="text-gray-400 mb-6">
              Customize how your organization appears on the front website and kiosk displays.
            </p>

            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Organization Name</h3>
                <input
                  type="text"
                  defaultValue={organization?.name || ""}
                  onBlur={(e) => {
                    if (e.target.value !== organization?.name) {
                      updateOrgMutation.mutate({ name: e.target.value });
                    }
                  }}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500"
                  placeholder="Your Organization Name"
                />
              </div>

              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Logo</h3>
                <p className="text-gray-400 text-sm mb-4">Upload your organization logo (shown on kiosk and party pages)</p>
                
                <div className="flex items-center gap-4">
                  {organization?.logoUrl ? (
                    <img src={organization.logoUrl} alt="Logo" className="h-16 w-auto rounded-lg bg-white/10 p-2" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-white/10 flex items-center justify-center">
                      <Music2 className="w-8 h-8 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="text"
                      defaultValue={organization?.logoUrl || ""}
                      onBlur={(e) => {
                        if (e.target.value !== organization?.logoUrl) {
                          updateOrgMutation.mutate({ logoUrl: e.target.value || undefined });
                        }
                      }}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 text-sm"
                      placeholder="Logo URL (or upload below)"
                    />
                    <label className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors text-sm">
                      <Upload className="w-4 h-4" />
                      {isUploading ? "Uploading..." : "Upload Logo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const result = await uploadFile(file);
                            if (result?.objectPath) {
                              updateOrgMutation.mutate({ logoUrl: result.objectPath });
                            }
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Colors</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={organization?.primaryColor || "#2563eb"}
                        onChange={(e) => updateOrgMutation.mutate({ primaryColor: e.target.value })}
                        className="w-12 h-10 rounded cursor-pointer border-0"
                      />
                      <input
                        type="text"
                        value={organization?.primaryColor || "#2563eb"}
                        onChange={(e) => updateOrgMutation.mutate({ primaryColor: e.target.value })}
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={organization?.accentColor || "#f59e0b"}
                        onChange={(e) => updateOrgMutation.mutate({ accentColor: e.target.value })}
                        className="w-12 h-10 rounded cursor-pointer border-0"
                      />
                      <input
                        type="text"
                        value={organization?.accentColor || "#f59e0b"}
                        onChange={(e) => updateOrgMutation.mutate({ accentColor: e.target.value })}
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && selectedVenue && (
          <div className="max-w-4xl">
            <h1 className="text-3xl font-bold text-white mb-8">Venue Settings</h1>
            <p className="text-gray-400 mb-6">
              Configure backup playlists, announcements, and speaker connections for <span className="text-white font-medium">{selectedVenue.name}</span>.
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Backup Playlists */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <ListMusic className="w-5 h-5" />
                    Backup Playlists ({backupPlaylists.length}/10)
                  </h3>
                  <button
                    onClick={() => setShowPlaylistModal(true)}
                    disabled={backupPlaylists.length >= 10}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Songs from these Apple Music playlists will play automatically when the queue is empty.
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {backupPlaylists.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No playlists added yet</p>
                  ) : (
                    backupPlaylists.map((playlist: any) => (
                      <div key={playlist.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                        {playlist.artworkUrl && (
                          <img src={playlist.artworkUrl} alt="" className="w-12 h-12 rounded object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{playlist.name || "Playlist"}</p>
                          <p className="text-gray-400 text-sm">{playlist.trackCount || 0} tracks</p>
                        </div>
                        <button
                          onClick={() => removePlaylistMutation.mutate(playlist.id.toString())}
                          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Sonos Integration - Coming Soon */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 opacity-60">
                <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <Speaker className="w-5 h-5" />
                  Sonos Speakers
                  <span className="text-xs bg-indigo-600/50 text-indigo-200 px-2 py-0.5 rounded-full ml-2">Coming Soon</span>
                </h3>
                <p className="text-gray-400 text-sm">
                  Connect Sonos speakers to play music throughout your venue. This feature is currently in development.
                </p>
              </div>

              {/* Announcements */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 md:col-span-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Volume2 className="w-5 h-5" />
                    Announcements ({announcements.length})
                  </h3>
                  <button
                    onClick={() => setShowAnnouncementModal(true)}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Pre-recorded audio messages that play between songs.
                </p>
                
                {/* Announcement Settings */}
                <div className="mb-4 p-4 bg-white/5 rounded-lg">
                  <h4 className="text-white font-medium mb-3">Frequency Settings</h4>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-gray-400 text-sm">Play every:</label>
                      <select
                        value={selectedVenue.announcementFrequencyType || "disabled"}
                        onChange={(e) => updateAnnouncementSettingsMutation.mutate({ 
                          frequencyType: e.target.value === "disabled" ? null : e.target.value 
                        })}
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="disabled" className="bg-gray-900">Disabled</option>
                        <option value="songs" className="bg-gray-900">X songs</option>
                        <option value="minutes" className="bg-gray-900">X minutes</option>
                        <option value="hourly" className="bg-gray-900">Top of each hour</option>
                      </select>
                    </div>
                    {selectedVenue.announcementFrequencyType && selectedVenue.announcementFrequencyType !== 'hourly' && (
                      <div className="flex items-center gap-2">
                        <label className="text-gray-400 text-sm">
                          {selectedVenue.announcementFrequencyType === 'songs' ? 'Songs:' : 'Minutes:'}
                        </label>
                        <select
                          value={selectedVenue.announcementFrequency || 5}
                          onChange={(e) => updateAnnouncementSettingsMutation.mutate({ frequency: parseInt(e.target.value) })}
                          className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                        >
                          {selectedVenue.announcementFrequencyType === 'songs' 
                            ? [1, 2, 3, 4, 5, 10, 15, 20].map(n => (
                                <option key={n} value={n} className="bg-gray-900">{n}</option>
                              ))
                            : [5, 10, 15, 30, 45, 60, 90, 120].map(n => (
                                <option key={n} value={n} className="bg-gray-900">{n}</option>
                              ))
                          }
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-gray-400 text-sm">Order:</label>
                      <select
                        value={selectedVenue.announcementPlayMode || "sequential"}
                        onChange={(e) => updateAnnouncementSettingsMutation.mutate({ playMode: e.target.value })}
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="sequential" className="bg-gray-900">Sequential</option>
                        <option value="random" className="bg-gray-900">Random</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {announcements.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4 col-span-full">No announcements yet</p>
                  ) : (
                    announcements.map((announcement: Announcement) => (
                      <div key={announcement.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                        <Volume2 className={`w-5 h-5 ${announcement.isActive ? 'text-green-400' : 'text-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{announcement.name}</p>
                        </div>
                        <button
                          onClick={() => toggleAnnouncementMutation.mutate({ id: announcement.id, isActive: !announcement.isActive })}
                          className={`px-2 py-1 text-xs rounded ${announcement.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}
                        >
                          {announcement.isActive ? "On" : "Off"}
                        </button>
                        <button
                          onClick={() => deleteAnnouncementMutation.mutate(announcement.id)}
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && !selectedVenue && (
          <div className="text-center py-12">
            <p className="text-gray-400">Please select a venue first to configure settings.</p>
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

      {showAnnouncementModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Add Announcement</h2>
            <p className="text-gray-400 mb-4">
              Upload an audio file (MP3, WAV, etc.) that will play between songs.
            </p>
            <input
              type="text"
              value={announcementName}
              onChange={(e) => setAnnouncementName(e.target.value)}
              placeholder="Announcement name (e.g., Happy Hour Special)"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-4"
              autoFocus
            />
            <label className="block w-full">
              <div className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-dashed border-white/20 rounded-lg text-gray-300 hover:bg-white/10 cursor-pointer transition-colors">
                <Upload className="w-5 h-5" />
                {isUploading || createAnnouncementMutation.isPending ? "Uploading..." : "Choose Audio File"}
              </div>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={isUploading || createAnnouncementMutation.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAnnouncementUpload(file);
                  }
                }}
              />
            </label>
            {announcementError && (
              <p className="text-red-400 text-sm mt-2">{announcementError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowAnnouncementModal(false);
                  setAnnouncementName("");
                  setAnnouncementError("");
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
