import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Settings, LogOut, Plus, Trash2, ListMusic, Volume2, Upload, Speaker, Shield, ArrowLeft, Search, User, Clock, Key, Copy, RefreshCw, Check, Code, AlertTriangle, Send } from "lucide-react";
import { fetchVenue, fetchMyVenues, updateVenue, fetchBackupPlaylists, addBackupPlaylist, removeBackupPlaylist, updateBackupPlaylistWeight, fetchAnnouncementGroups, createAnnouncementGroup, updateAnnouncementGroup, deleteAnnouncementGroup, addAnnouncementToGroup, deleteAnnouncement, updateAnnouncement, checkSuperAdmin, searchPlaylists, addBackupPlaylistById, fetchKioskStatus, fetchApiKey, generateApiKey, triggerTestAnnouncement, type AnnouncementGroup, type Announcement } from "../lib/api";
import { useUpload } from "../hooks/use-upload";
import { useAuth } from "../hooks/use-auth";
import { useMusicKit } from "../hooks/useMusicKit";
import { cn } from "../lib/utils";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { uploadFile, isUploading } = useUpload({
    onError: (err) => {
      // Surface upload failures (presigned URL fetch, GCS PUT, network) into
      // the announcement modal — otherwise the user sees nothing happen.
      setAnnouncementError(err.message || "Upload failed. Please try again.");
    },
  });
  const { isConfigured: musicKitConfigured, isAuthorized: musicKitAuthorized, authorize: authorizeMusicKit, musicKit } = useMusicKit();
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });
  
  const [selectedVenueCode, setSelectedVenueCode] = useState<string | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistError, setPlaylistError] = useState("");
  const [playlistSearchTerm, setPlaylistSearchTerm] = useState("");
  const [playlistSearchResults, setPlaylistSearchResults] = useState<any[]>([]);
  const [isSearchingPlaylists, setIsSearchingPlaylists] = useState(false);
  const [libraryPlaylists, setLibraryPlaylists] = useState<any[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementName, setAnnouncementName] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const [addingToGroupId, setAddingToGroupId] = useState<number | null>(null);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupFrequencyType, setNewGroupFrequencyType] = useState("songs");
  const [newGroupFrequency, setNewGroupFrequency] = useState(5);
  const [newGroupPlayMode, setNewGroupPlayMode] = useState("sequential");
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [testAnnounceMessage, setTestAnnounceMessage] = useState("This is a test announcement from Jukboks. If you can hear this, your kiosk is ready for urgent alerts.");
  const [testAnnounceResult, setTestAnnounceResult] = useState<{ ok: boolean; text: string } | null>(null);

  const testAnnounceMutation = useMutation({
    mutationFn: ({ code, message }: { code: string; message: string }) =>
      triggerTestAnnouncement(code, { message }),
    onSuccess: (data) => {
      setTestAnnounceResult({ ok: true, text: data.message });
      setTimeout(() => setTestAnnounceResult(null), 8000);
    },
    onError: (err: Error) => {
      setTestAnnounceResult({ ok: false, text: err.message });
      setTimeout(() => setTestAnnounceResult(null), 8000);
    },
  });

  const { data: apiKeyData, refetch: refetchApiKey } = useQuery({
    queryKey: ["apiKey"],
    queryFn: fetchApiKey,
    enabled: isAuthenticated,
  });

  const generateKeyMutation = useMutation({
    mutationFn: generateApiKey,
    onSuccess: (data) => {
      setNewlyGeneratedKey(data.apiKey);
      refetchApiKey();
    },
  });

  const displayKey = newlyGeneratedKey || apiKeyData?.maskedKey;
  const canCopy = !!newlyGeneratedKey;

  const copyApiKey = useCallback(() => {
    if (newlyGeneratedKey) {
      navigator.clipboard.writeText(newlyGeneratedKey);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    }
  }, [newlyGeneratedKey]);

  const fetchLibraryPlaylists = useCallback(async () => {
    if (!musicKit || !musicKitAuthorized) return;
    setIsLoadingLibrary(true);
    try {
      const response = await musicKit.api.music('/v1/me/library/playlists', { limit: 50 });
      const playlists = response.data.data || [];
      
      const formattedPlaylists = await Promise.all(playlists.map(async (p: any) => {
        let trackCount = p.attributes?.trackCount || 0;
        
        if (trackCount === 0) {
          try {
            const tracksResponse = await musicKit.api.music(`/v1/me/library/playlists/${p.id}/tracks?limit=1`);
            trackCount = tracksResponse.data.meta?.total || 0;
          } catch (e) {
            console.error("Failed to fetch track count for playlist:", p.id);
          }
        }
        
        return {
          id: p.id,
          name: p.attributes?.name || "Unknown Playlist",
          curatorName: "My Library",
          trackCount,
          artworkUrl: p.attributes?.artwork?.url?.replace("{w}x{h}", "100x100") || null,
          isLibrary: true,
        };
      }));
      
      setLibraryPlaylists(formattedPlaylists);
    } catch (error) {
      console.error("Failed to fetch library playlists:", error);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [musicKit, musicKitAuthorized]);

  useEffect(() => {
    if (showPlaylistModal && musicKitAuthorized) {
      fetchLibraryPlaylists();
    }
  }, [showPlaylistModal, musicKitAuthorized, fetchLibraryPlaylists]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
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

  const { data: kioskStatus } = useQuery({
    queryKey: ["kiosk-status", selectedVenueCode],
    queryFn: () => fetchKioskStatus(selectedVenueCode!),
    enabled: !!selectedVenueCode,
    refetchInterval: 30000,
  });

  const { data: backupPlaylists = [] } = useQuery({
    queryKey: ["backupPlaylists", selectedVenueCode],
    queryFn: () => fetchBackupPlaylists(selectedVenueCode!),
    enabled: !!selectedVenueCode,
  });

  const { data: announcementGroupsData } = useQuery({
    queryKey: ["announcement-groups", selectedVenue?.id],
    queryFn: () => fetchAnnouncementGroups(selectedVenue!.id),
    enabled: !!selectedVenue?.id,
  });
  const announcementGroups = announcementGroupsData?.groups || [];

  const addPlaylistMutation = useMutation({
    mutationFn: (url: string) => addBackupPlaylist(selectedVenue!.id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenueCode] });
      setShowPlaylistModal(false);
      setPlaylistUrl("");
      setPlaylistError("");
      setPlaylistSearchTerm("");
      setPlaylistSearchResults([]);
    },
    onError: (error: any) => {
      setPlaylistError(error.message || "Failed to add playlist");
    },
  });

  const addPlaylistByIdMutation = useMutation({
    mutationFn: async (playlist: { id: string; name: string; trackCount: number; artworkUrl: string | null; isLibrary?: boolean }) => {
      let finalTrackCount = playlist.trackCount;
      
      if (playlist.isLibrary && musicKit) {
        try {
          const response = await musicKit.api.music(`/v1/me/library/playlists/${playlist.id}/tracks?limit=1`);
          const meta = response.data.meta;
          if (meta?.total !== undefined) {
            finalTrackCount = meta.total;
            console.log("Fetched library playlist track count from meta.total:", finalTrackCount);
          } else {
            const fullResponse = await musicKit.api.music(`/v1/me/library/playlists/${playlist.id}?include=tracks`);
            const playlistData = fullResponse.data.data?.[0];
            if (playlistData) {
              finalTrackCount = playlistData.relationships?.tracks?.data?.length || 0;
              console.log("Fetched library playlist track count from tracks:", finalTrackCount);
            }
          }
        } catch (error) {
          console.error("Failed to fetch library playlist details:", error);
        }
      }
      
      return addBackupPlaylistById(selectedVenue!.id, {
        ...playlist,
        trackCount: finalTrackCount,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenueCode] });
      setShowPlaylistModal(false);
      setPlaylistUrl("");
      setPlaylistError("");
      setPlaylistSearchTerm("");
      setPlaylistSearchResults([]);
    },
    onError: (error: any) => {
      setPlaylistError(error.message || "Failed to add playlist");
    },
  });

  const handleSearchPlaylists = async () => {
    if (!playlistSearchTerm.trim()) return;
    setIsSearchingPlaylists(true);
    setPlaylistError("");
    try {
      const results = await searchPlaylists(playlistSearchTerm);
      setPlaylistSearchResults(results);
    } catch (error: any) {
      setPlaylistError(error.message || "Search failed");
    } finally {
      setIsSearchingPlaylists(false);
    }
  };

  const removePlaylistMutation = useMutation({
    mutationFn: (playlistId: string) => removeBackupPlaylist(selectedVenue!.id, playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenueCode] });
    },
  });

  const updatePlaylistWeightMutation = useMutation({
    mutationFn: ({ playlistId, weight }: { playlistId: number; weight: number }) => 
      updateBackupPlaylistWeight(selectedVenue!.id, playlistId, weight),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenueCode] });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (data: { frequencyType?: string; frequency?: number; playMode?: string }) => 
      createAnnouncementGroup(selectedVenue!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-groups", selectedVenue?.id] });
      setShowNewGroupModal(false);
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: { frequencyType?: string; frequency?: number; playMode?: string } }) => 
      updateAnnouncementGroup(selectedVenue!.id, groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-groups", selectedVenue?.id] });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: number) => deleteAnnouncementGroup(selectedVenue!.id, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-groups", selectedVenue?.id] });
    },
  });

  const addAnnouncementMutation = useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: { name: string; audioUrl: string } }) => 
      addAnnouncementToGroup(selectedVenue!.id, groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-groups", selectedVenue?.id] });
      setShowAnnouncementModal(false);
      setAnnouncementName("");
      setAnnouncementError("");
      setAddingToGroupId(null);
    },
    onError: (error: any) => {
      setAnnouncementError(error.message || "Failed to create announcement");
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: (announcementId: number) => deleteAnnouncement(selectedVenue!.id, announcementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-groups", selectedVenue?.id] });
    },
  });

  const toggleAnnouncementMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => 
      updateAnnouncement(selectedVenue!.id, id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-groups", selectedVenue?.id] });
    },
  });

  const updateVenueMutation = useMutation({
    mutationFn: (data: { allowExplicit?: boolean; autoApprove?: boolean; dailyRequestLimit?: number; songCooldownMinutes?: number; artistCooldownMinutes?: number; artistMaxPlaysPerHour?: number; [key: string]: any }) => 
      updateVenue(selectedVenue!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venue", selectedVenueCode] });
    },
  });

  const handleAddPlaylist = () => {
    if (playlistUrl.trim()) {
      setPlaylistError("");
      addPlaylistMutation.mutate(playlistUrl.trim());
    }
  };

  const handleAnnouncementUpload = async (file: File) => {
    setAnnouncementError("");
    if (!announcementName.trim()) {
      setAnnouncementError("Please enter a name for the announcement");
      return;
    }
    if (!addingToGroupId) {
      setAnnouncementError("No group selected");
      return;
    }
    // Reject obviously-wrong files early with a clear message.
    if (file.type && !file.type.startsWith("audio/")) {
      setAnnouncementError("Please choose an audio file (MP3, WAV, M4A, etc.)");
      return;
    }
    // 50 MB cap — keeps presigned upload well under the 15-minute URL window.
    if (file.size > 50 * 1024 * 1024) {
      setAnnouncementError("Audio file is too large (max 50 MB).");
      return;
    }
    try {
      const result = await uploadFile(file);
      if (!result?.objectPath) {
        // useUpload's onError already set a message; fall back if not.
        setAnnouncementError(prev => prev || "Upload failed. Please try again.");
        return;
      }
      addAnnouncementMutation.mutate({
        groupId: addingToGroupId,
        data: {
          name: announcementName.trim(),
          audioUrl: result.objectPath,
        },
      });
    } catch (err: any) {
      setAnnouncementError(err?.message || "Upload failed. Please try again.");
    }
  };

  if (authLoading || venuesLoading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col overflow-hidden">
      <header className="border-b border-white/10 p-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center">
            <img src="/assets/logo-full.png" alt="Jukboks" className="h-12" />
          </a>
          <div className="flex items-center gap-4">
            {superAdminCheck?.isSuperAdmin && (
              <a
                href="/super-admin"
                className="p-2 text-yellow-400 hover:text-yellow-300 transition-colors"
                title="Super Admin"
              >
                <Shield className="w-5 h-5" />
              </a>
            )}
            <span className="text-gray-400 text-sm hidden sm:block">{user?.email}</span>
            <a
              href="/api/logout"
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex-1 flex flex-col overflow-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <a
              href="/admin"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </a>
          </div>
          
          {venues.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Venue:</span>
              <select
                value={selectedVenueCode || ""}
                onChange={(e) => setSelectedVenueCode(e.target.value)}
                className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {venues.map((venue: any) => (
                  <option key={venue.code} value={venue.code} className="bg-gray-900">
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-8 h-8 text-indigo-400" />
          <h1 className="text-3xl font-bold text-white">Venue Settings</h1>
        </div>

        {venues.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">No venues yet. Create a venue first to configure settings.</p>
            <a
              href="/admin/venues"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Go to Venues
            </a>
          </div>
        ) : selectedVenue ? (
          <div className="space-y-4 flex-1 overflow-auto">
            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <h3 className="text-lg font-bold text-white mb-4">Venue Options</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Allow Explicit</p>
                    <p className="text-gray-400 text-xs">Allow explicit content in requests</p>
                  </div>
                  <button
                    onClick={() => updateVenueMutation.mutate({ allowExplicit: !selectedVenue.allowExplicit })}
                    className={`w-12 h-6 rounded-full transition-colors ${selectedVenue.allowExplicit ? 'bg-indigo-600' : 'bg-gray-600'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${selectedVenue.allowExplicit ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Auto-Approve</p>
                    <p className="text-gray-400 text-xs">Automatically approve requests</p>
                  </div>
                  <button
                    onClick={() => updateVenueMutation.mutate({ autoApprove: !selectedVenue.autoApprove })}
                    className={`w-12 h-6 rounded-full transition-colors ${selectedVenue.autoApprove ? 'bg-indigo-600' : 'bg-gray-600'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${selectedVenue.autoApprove ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Request Limit</p>
                    <p className="text-gray-400 text-xs">Songs per guest in queue</p>
                  </div>
                  <select
                    value={selectedVenue.dailyRequestLimit ?? 5}
                    onChange={(e) => updateVenueMutation.mutate({ dailyRequestLimit: parseInt(e.target.value) })}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="1" className="bg-gray-900">1</option>
                    <option value="2" className="bg-gray-900">2</option>
                    <option value="3" className="bg-gray-900">3</option>
                    <option value="5" className="bg-gray-900">5</option>
                    <option value="10" className="bg-gray-900">10</option>
                    <option value="0" className="bg-gray-900">Unlimited</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Song Cooldown</p>
                    <p className="text-gray-400 text-xs">How long before a song can repeat</p>
                  </div>
                  <select
                    value={selectedVenue.songCooldownMinutes ?? 120}
                    onChange={(e) => updateVenueMutation.mutate({ songCooldownMinutes: parseInt(e.target.value) })}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="0" className="bg-gray-900">Off</option>
                    <option value="30" className="bg-gray-900">30 min</option>
                    <option value="60" className="bg-gray-900">1 hour</option>
                    <option value="120" className="bg-gray-900">2 hours</option>
                    <option value="180" className="bg-gray-900">3 hours</option>
                    <option value="240" className="bg-gray-900">4 hours</option>
                    <option value="360" className="bg-gray-900">6 hours</option>
                    <option value="480" className="bg-gray-900">8 hours</option>
                    <option value="720" className="bg-gray-900">12 hours</option>
                    <option value="1440" className="bg-gray-900">24 hours</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Artist Limit</p>
                    <p className="text-gray-400 text-xs">Max plays per artist per hour</p>
                  </div>
                  <select
                    value={selectedVenue.artistMaxPlaysPerHour ?? 3}
                    onChange={(e) => updateVenueMutation.mutate({ artistMaxPlaysPerHour: parseInt(e.target.value) })}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="1" className="bg-gray-900">1</option>
                    <option value="2" className="bg-gray-900">2</option>
                    <option value="3" className="bg-gray-900">3</option>
                    <option value="4" className="bg-gray-900">4</option>
                    <option value="5" className="bg-gray-900">5</option>
                    <option value="10" className="bg-gray-900">10</option>
                    <option value="0" className="bg-gray-900">No limit</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Kiosk Schedule
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">Enable Schedule</p>
                    <p className="text-gray-400 text-xs">Auto-start/stop kiosk at scheduled times</p>
                  </div>
                  <button
                    onClick={() => updateVenueMutation.mutate({ kioskScheduleEnabled: !selectedVenue.kioskScheduleEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors ${selectedVenue.kioskScheduleEnabled ? 'bg-indigo-600' : 'bg-gray-600'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${selectedVenue.kioskScheduleEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                
                {selectedVenue.kioskScheduleEnabled && (
                  <>
                    <div>
                      <label className="text-white text-sm mb-2 block">Schedule by Day</label>
                      <div className="space-y-2">
                        {[
                          { key: "sun", label: "Sunday" },
                          { key: "mon", label: "Monday" },
                          { key: "tue", label: "Tuesday" },
                          { key: "wed", label: "Wednesday" },
                          { key: "thu", label: "Thursday" },
                          { key: "fri", label: "Friday" },
                          { key: "sat", label: "Saturday" },
                        ].map((day) => {
                          const days = (selectedVenue.kioskScheduleDays as string[]) || ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
                          const isActive = days.includes(day.key);
                          const daySchedules = (selectedVenue.kioskDaySchedules as Record<string, { startTime: string; endTime: string }>) || {};
                          const daySchedule = daySchedules[day.key];
                          const startTime = daySchedule?.startTime || selectedVenue.kioskStartTime || "12:00";
                          const endTime = daySchedule?.endTime || selectedVenue.kioskEndTime || "21:00";
                          
                          return (
                            <div key={day.key} className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const newDays = isActive
                                    ? days.filter((d) => d !== day.key)
                                    : [...days, day.key];
                                  updateVenueMutation.mutate({ kioskScheduleDays: newDays });
                                }}
                                className={`w-20 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors text-left ${
                                  isActive
                                    ? "bg-indigo-600 text-white"
                                    : "bg-white/10 text-gray-400 hover:bg-white/20"
                                }`}
                              >
                                {day.label.slice(0, 3)}
                              </button>
                              {isActive && (
                                <>
                                  <input
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => {
                                      const newSchedules = { ...daySchedules, [day.key]: { startTime: e.target.value, endTime } };
                                      updateVenueMutation.mutate({ kioskDaySchedules: newSchedules });
                                    }}
                                    className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs focus:outline-none focus:border-indigo-500"
                                  />
                                  <span className="text-gray-400 text-xs">to</span>
                                  <input
                                    type="time"
                                    value={endTime}
                                    onChange={(e) => {
                                      const newSchedules = { ...daySchedules, [day.key]: { startTime, endTime: e.target.value } };
                                      updateVenueMutation.mutate({ kioskDaySchedules: newSchedules });
                                    }}
                                    className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs focus:outline-none focus:border-indigo-500"
                                  />
                                </>
                              )}
                              {!isActive && (
                                <span className="text-gray-500 text-xs">Off</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-gray-500 text-xs mt-2">Click a day to enable/disable, then set custom times for each day</p>
                    </div>
                    <div>
                      <label className="text-white text-sm mb-1 block">Alert Email (optional)</label>
                      <input
                        type="email"
                        value={selectedVenue.kioskAlertEmail || ""}
                        onChange={(e) => updateVenueMutation.mutate({ kioskAlertEmail: e.target.value || null })}
                        placeholder="email@example.com"
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-gray-500 text-xs mt-1">Get notified if kiosk goes offline during scheduled hours</p>
                    </div>
                    {kioskStatus?.offlineDuringSchedule && (
                      <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg animate-pulse">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <p className="text-red-400 text-sm font-semibold">Kiosk Offline During Scheduled Hours</p>
                        </div>
                        <p className="text-red-300/80 text-xs">
                          Your kiosk should be running right now but isn't responding. Check the device's power and internet connection.
                        </p>
                        {kioskStatus?.lastHeartbeat && (
                          <p className="text-red-300/60 text-xs mt-1">
                            Last seen: {new Date(kioskStatus.lastHeartbeat).toLocaleString()}
                          </p>
                        )}
                        {selectedVenue.kioskAlertEmail && kioskStatus?.offlineDuringSchedule && (
                          <p className="text-red-300/60 text-xs mt-0.5">
                            Alert will be sent to {selectedVenue.kioskAlertEmail}
                          </p>
                        )}
                      </div>
                    )}
                    <div className={`p-3 rounded-lg ${kioskStatus?.offlineDuringSchedule ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          kioskStatus?.isOnline 
                            ? kioskStatus?.playbackStatus === 'playing' 
                              ? 'bg-green-500 animate-pulse' 
                              : 'bg-yellow-500'
                            : 'bg-red-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">
                            {kioskStatus?.isOnline 
                              ? kioskStatus?.playbackStatus === 'playing' 
                                ? 'Playing' 
                                : kioskStatus?.playbackStatus === 'paused'
                                  ? 'Paused'
                                  : kioskStatus?.playbackStatus === 'scheduled'
                                    ? 'Waiting for Schedule'
                                    : 'Ready'
                              : 'Offline'}
                          </p>
                          {kioskStatus?.isOnline && kioskStatus?.deviceName && (
                            <p className="text-indigo-400 text-xs truncate">
                              {kioskStatus.deviceName}
                            </p>
                          )}
                          {kioskStatus?.lastHeartbeat && (
                            <p className="text-gray-500 text-xs">
                              Last seen: {new Date(kioskStatus.lastHeartbeat).toLocaleTimeString()}
                            </p>
                          )}
                          {kioskStatus?.isWithinSchedule && !kioskStatus?.isOnline && (
                            <p className="text-red-400 text-xs mt-0.5">
                              Should be active now ({kioskStatus?.kioskStartTime} - {kioskStatus?.kioskEndTime})
                            </p>
                          )}
                        </div>
                        {selectedVenueCode && (
                          <a
                            href={`/kiosk/${selectedVenueCode}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 text-xs flex-shrink-0"
                          >
                            Open Kiosk
                          </a>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 lg:row-span-2 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ListMusic className="w-4 h-4" />
                  Backup Playlists ({backupPlaylists.length}/10)
                </h3>
                <button
                  onClick={() => setShowPlaylistModal(true)}
                  disabled={backupPlaylists.length >= 10}
                  className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-gray-400 text-xs mb-3">
                Auto-play when queue is empty.
              </p>
              <div className="space-y-1.5 flex-1 overflow-y-auto">
                {backupPlaylists.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-3">No playlists added</p>
                ) : (
                  backupPlaylists.map((playlist: any) => (
                    <div key={playlist.id} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                      {playlist.artworkUrl && (
                        <img src={playlist.artworkUrl} alt="" className="w-8 h-8 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{playlist.name || "Playlist"}</p>
                        <p className="text-gray-400 text-xs">{playlist.trackCount || 0} tracks</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs mr-1">Weight:</span>
                        {[1, 2, 3, 4, 5].map((w) => (
                          <button
                            key={w}
                            onClick={() => updatePlaylistWeightMutation.mutate({ playlistId: playlist.id, weight: w })}
                            className={`w-5 h-5 text-xs rounded ${
                              (playlist.weight || 3) === w 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-white/10 text-gray-400 hover:bg-white/20'
                            } transition-colors`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => removePlaylistMutation.mutate(playlist.id.toString())}
                        className="p-1 text-gray-400 hover:text-red-400 transition-colors ml-2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 lg:col-span-2 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Announcements ({announcementGroups.reduce((acc, g) => acc + (g.announcements?.length || 0), 0)})
                </h3>
                <button
                  onClick={() => setShowNewGroupModal(true)}
                  className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center gap-1"
                  title="Add new announcement group with different rules"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-xs">New Group</span>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3">
                {announcementGroups.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-gray-500 text-sm mb-3">No announcement groups yet</p>
                    <button
                      onClick={() => setShowNewGroupModal(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Create First Group
                    </button>
                  </div>
                ) : (
                  announcementGroups.map((group: AnnouncementGroup) => (
                    <div key={group.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={group.frequencyType}
                            onChange={(e) => updateGroupMutation.mutate({ 
                              groupId: group.id, 
                              data: { frequencyType: e.target.value } 
                            })}
                            className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-indigo-500"
                          >
                            <option value="songs" className="bg-gray-900">Every X songs</option>
                            <option value="minutes" className="bg-gray-900">Every X min</option>
                            <option value="hourly" className="bg-gray-900">Hourly</option>
                          </select>
                        </div>
                        {group.frequencyType !== 'hourly' && (
                          <select
                            value={group.frequency}
                            onChange={(e) => updateGroupMutation.mutate({ 
                              groupId: group.id, 
                              data: { frequency: parseInt(e.target.value) } 
                            })}
                            className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-indigo-500"
                          >
                            {group.frequencyType === 'songs' 
                              ? [1, 2, 3, 4, 5, 10, 15, 20].map(n => (
                                  <option key={n} value={n} className="bg-gray-900">{n}</option>
                                ))
                              : [5, 10, 15, 30, 45, 60, 90, 120].map(n => (
                                  <option key={n} value={n} className="bg-gray-900">{n}</option>
                                ))
                            }
                          </select>
                        )}
                        <select
                          value={group.playMode}
                          onChange={(e) => updateGroupMutation.mutate({ 
                            groupId: group.id, 
                            data: { playMode: e.target.value } 
                          })}
                          className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="sequential" className="bg-gray-900">Sequential</option>
                          <option value="random" className="bg-gray-900">Random</option>
                        </select>
                        <div className="flex-1" />
                        <button
                          onClick={() => {
                            setAddingToGroupId(group.id);
                            setShowAnnouncementModal(true);
                          }}
                          className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                          title="Add announcement to this group"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteGroupMutation.mutate(group.id)}
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete group"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <div className="space-y-1">
                        {(!group.announcements || group.announcements.length === 0) ? (
                          <p className="text-gray-500 text-xs py-1">No announcements in this group</p>
                        ) : (
                          group.announcements.map((announcement: Announcement) => (
                            <div key={announcement.id} className="flex items-center gap-2 p-1.5 bg-white/5 rounded">
                              <Volume2 className={`w-3 h-3 ${announcement.isActive ? 'text-green-400' : 'text-gray-500'}`} />
                              <p className="text-white text-xs flex-1 truncate">{announcement.name}</p>
                              <button
                                onClick={() => toggleAnnouncementMutation.mutate({ id: announcement.id, isActive: !announcement.isActive })}
                                className={`px-1.5 py-0.5 text-xs rounded ${announcement.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}
                              >
                                {announcement.isActive ? "On" : "Off"}
                              </button>
                              <button
                                onClick={() => deleteAnnouncementMutation.mutate(announcement.id)}
                                className="p-0.5 text-gray-400 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 opacity-60">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Speaker className="w-4 h-4" />
                Sonos Speakers
                <span className="text-xs bg-indigo-600/50 text-indigo-200 px-2 py-0.5 rounded-full ml-2">Coming Soon</span>
              </h3>
              <p className="text-gray-400 text-xs mt-2">
                Connect Sonos speakers to play music throughout your venue.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Code className="w-5 h-5 text-green-400" />
                Integration API
              </h3>
              <p className="text-gray-400 text-xs mb-4">
                Use your API key to integrate Jukboks with external platforms like LivHOA.
              </p>

              {displayKey ? (
                <div className="space-y-3">
                  {newlyGeneratedKey && (
                    <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <p className="text-green-400 text-xs font-medium mb-1">New API key generated — copy it now. It won't be shown again.</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2.5 bg-black/30 border border-white/10 rounded-lg font-mono text-sm text-gray-300 overflow-hidden">
                      {displayKey}
                    </div>
                    {canCopy && (
                      <button
                        onClick={copyApiKey}
                        className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                        title="Copy"
                      >
                        {apiKeyCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Generate a new API key? The current key will stop working immediately.")) {
                        setNewlyGeneratedKey(null);
                        generateKeyMutation.mutate();
                      }
                    }}
                    disabled={generateKeyMutation.isPending}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generateKeyMutation.isPending ? 'animate-spin' : ''}`} />
                    Regenerate Key
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => generateKeyMutation.mutate()}
                  disabled={generateKeyMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <Key className="w-4 h-4" />
                  {generateKeyMutation.isPending ? "Generating..." : "Generate API Key"}
                </button>
              )}

              <div className="mt-4 p-3 bg-black/20 border border-white/5 rounded-lg">
                <p className="text-gray-500 text-xs mb-2">Add this header to API requests:</p>
                <code className="text-green-400 text-xs font-mono">X-Jukboks-API-Key: your-key-here</code>
                <div className="mt-3 text-gray-500 text-xs space-y-1">
                  <p>Available endpoints:</p>
                  <p className="font-mono text-gray-400">GET /api/v1/venues - List your venues</p>
                  <p className="font-mono text-gray-400">GET /api/v1/venues/:code/queue - Get queue</p>
                  <p className="font-mono text-gray-400">GET /api/v1/venues/:code/now-playing - Now playing</p>
                  <p className="font-mono text-gray-400">GET /api/v1/venues/:code/history - Play history</p>
                  <p className="font-mono text-gray-400">GET /api/v1/search?term=... - Search songs</p>
                  <p className="font-mono text-gray-400">POST /api/v1/venues/:code/request - Request song</p>
                  <p className="font-mono text-gray-400">POST /api/v1/venues/:code/vote - Vote on song</p>
                  <p className="font-mono text-gray-400">POST /api/v1/venues/:code/announce - Trigger announcement</p>
                </div>
              </div>

              <div className="mt-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Test Urgent Announcement
                </h4>
                <p className="text-gray-400 text-xs mb-3">
                  Sends a test alert to <span className="font-mono text-amber-300">{selectedVenueCode || "(no venue)"}</span>. The kiosk will interrupt the current song and read this message aloud (twice).
                </p>
                <textarea
                  value={testAnnounceMessage}
                  onChange={(e) => setTestAnnounceMessage(e.target.value.slice(0, 500))}
                  rows={3}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500/50 resize-none"
                  placeholder="Enter announcement text..."
                  data-testid="input-test-announcement"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-gray-500">{testAnnounceMessage.length}/500</span>
                  <button
                    onClick={() => {
                      if (!selectedVenueCode || !testAnnounceMessage.trim()) return;
                      testAnnounceMutation.mutate({ code: selectedVenueCode, message: testAnnounceMessage });
                    }}
                    disabled={!selectedVenueCode || !testAnnounceMessage.trim() || testAnnounceMutation.isPending}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid="button-send-test-announcement"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {testAnnounceMutation.isPending ? "Sending..." : "Send Test Alert"}
                  </button>
                </div>
                {testAnnounceResult && (
                  <div
                    className={`mt-3 p-2.5 rounded-lg text-xs ${
                      testAnnounceResult.ok
                        ? "bg-green-500/10 border border-green-500/20 text-green-300"
                        : "bg-red-500/10 border border-red-500/20 text-red-300"
                    }`}
                    data-testid="text-test-announcement-result"
                  >
                    {testAnnounceResult.text}
                  </div>
                )}
                <p className="text-[10px] text-gray-500 mt-2">
                  External integrations (e.g. weather services, LivHOA) trigger the same alert via:
                </p>
                <code className="block mt-1 text-[10px] text-amber-300/80 font-mono break-all">
                  POST /api/v1/venues/{selectedVenueCode || ":code"}/announce
                </code>
              </div>
            </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">Please select a venue to configure settings.</p>
          </div>
        )}
      </main>

      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-white mb-4">Add Backup Playlist</h2>
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={playlistSearchTerm}
                onChange={(e) => setPlaylistSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchPlaylists()}
                placeholder="Search Apple Music playlists..."
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <button
                onClick={handleSearchPlaylists}
                disabled={isSearchingPlaylists || !playlistSearchTerm.trim()}
                className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
              {!musicKitAuthorized && musicKitConfigured && (
                <div className="p-4 bg-gradient-to-r from-pink-500/20 to-red-500/20 rounded-lg border border-pink-500/30">
                  <p className="text-white text-sm mb-3">Sign in to Apple Music to see your personal playlists</p>
                  <button
                    onClick={authorizeMusicKit}
                    className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <User className="w-4 h-4" />
                    Sign in to Apple Music
                  </button>
                </div>
              )}

              {musicKitAuthorized && (
                <div>
                  <h3 className="text-white font-medium text-sm mb-2 flex items-center gap-2">
                    <User className="w-4 h-4 text-pink-400" />
                    My Library
                  </h3>
                  {isLoadingLibrary ? (
                    <p className="text-gray-400 text-center py-2 text-sm">Loading your playlists...</p>
                  ) : libraryPlaylists.length > 0 ? (
                    <div className="space-y-2">
                      {libraryPlaylists.map((playlist: any) => (
                        <div 
                          key={playlist.id} 
                          className="flex items-center gap-3 p-3 bg-pink-500/10 rounded-lg hover:bg-pink-500/20 cursor-pointer transition-colors border border-pink-500/20"
                          onClick={() => addPlaylistByIdMutation.mutate(playlist)}
                        >
                          {playlist.artworkUrl ? (
                            <img src={playlist.artworkUrl} alt="" className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-pink-500/30 flex items-center justify-center">
                              <ListMusic className="w-5 h-5 text-pink-300" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate text-sm">{playlist.name}</p>
                            <p className="text-gray-400 text-xs">{playlist.trackCount || 0} tracks</p>
                          </div>
                          <Plus className="w-5 h-5 text-pink-400" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs text-center py-2">No playlists in your library</p>
                  )}
                </div>
              )}

              {playlistSearchResults.length > 0 && (
                <div>
                  <h3 className="text-white font-medium text-sm mb-2">Apple Music Catalog</h3>
                  <div className="space-y-2">
                    {playlistSearchResults.map((playlist: any) => (
                      <div 
                        key={playlist.id} 
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                        onClick={() => addPlaylistByIdMutation.mutate(playlist)}
                      >
                        {playlist.artworkUrl && (
                          <img src={playlist.artworkUrl} alt="" className="w-10 h-10 rounded object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate text-sm">{playlist.name}</p>
                          <p className="text-gray-400 text-xs">{playlist.curatorName} • {playlist.trackCount} tracks</p>
                        </div>
                        <Plus className="w-5 h-5 text-indigo-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {isSearchingPlaylists && (
                <p className="text-gray-400 text-center py-4">Searching...</p>
              )}
            </div>
            
            <div className="border-t border-white/10 pt-4 mt-auto">
              <p className="text-gray-500 text-xs mb-2">Or paste a playlist URL:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://music.apple.com/us/playlist/..."
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 text-sm"
                />
                <button
                  onClick={handleAddPlaylist}
                  disabled={!playlistUrl.trim() || addPlaylistMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm"
                >
                  Add
                </button>
              </div>
            </div>
            
            {playlistError && (
              <p className="text-red-400 text-sm mt-2">{playlistError}</p>
            )}
            
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowPlaylistModal(false);
                  setPlaylistUrl("");
                  setPlaylistError("");
                  setPlaylistSearchTerm("");
                  setPlaylistSearchResults([]);
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
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
            <label className="block text-gray-400 text-sm mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={announcementName}
              onChange={(e) => {
                setAnnouncementName(e.target.value);
                if (announcementError) setAnnouncementError("");
              }}
              placeholder="e.g., Happy Hour Special"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-4"
              autoFocus
            />
            <label className={cn(
              "block w-full",
              (!announcementName.trim() || isUploading || addAnnouncementMutation.isPending) &&
                "opacity-50 pointer-events-none"
            )}>
              <div className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-dashed border-white/20 rounded-lg text-gray-300 hover:bg-white/10 cursor-pointer transition-colors">
                <Upload className="w-5 h-5" />
                {isUploading || addAnnouncementMutation.isPending ? "Uploading..." : "Choose Audio File"}
              </div>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={!announcementName.trim() || isUploading || addAnnouncementMutation.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Reset the input so the same file can be picked again after an error
                  e.target.value = "";
                  if (file) {
                    handleAnnouncementUpload(file);
                  }
                }}
              />
            </label>
            {!announcementName.trim() && (
              <p className="text-gray-500 text-xs mt-2">Enter a name above to enable file upload.</p>
            )}
            {announcementError && (
              <p className="text-red-400 text-sm mt-2">{announcementError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowAnnouncementModal(false);
                  setAnnouncementName("");
                  setAnnouncementError("");
                  setAddingToGroupId(null);
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewGroupModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Create Announcement Group</h2>
            <p className="text-gray-400 mb-4">
              Create a new group with its own playback rules. You can add announcements to it after creation.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Play announcements:</label>
                <select
                  value={newGroupFrequencyType}
                  onChange={(e) => setNewGroupFrequencyType(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="songs" className="bg-gray-900">Every X songs</option>
                  <option value="minutes" className="bg-gray-900">Every X minutes</option>
                  <option value="hourly" className="bg-gray-900">Hourly (top of hour)</option>
                </select>
              </div>
              
              {newGroupFrequencyType !== 'hourly' && (
                <div>
                  <label className="block text-gray-400 text-sm mb-1">
                    {newGroupFrequencyType === 'songs' ? 'Number of songs:' : 'Minutes:'}
                  </label>
                  <select
                    value={newGroupFrequency}
                    onChange={(e) => setNewGroupFrequency(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    {newGroupFrequencyType === 'songs' 
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
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Play order:</label>
                <select
                  value={newGroupPlayMode}
                  onChange={(e) => setNewGroupPlayMode(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="sequential" className="bg-gray-900">Sequential</option>
                  <option value="random" className="bg-gray-900">Random</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewGroupModal(false);
                  setNewGroupFrequencyType("songs");
                  setNewGroupFrequency(5);
                  setNewGroupPlayMode("sequential");
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createGroupMutation.mutate({
                  frequencyType: newGroupFrequencyType,
                  frequency: newGroupFrequency,
                  playMode: newGroupPlayMode,
                })}
                disabled={createGroupMutation.isPending}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {createGroupMutation.isPending ? "Creating..." : "Create Group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
