import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, Settings, LogOut, Plus, Trash2, ListMusic, Volume2, Upload, Speaker, Shield, ArrowLeft } from "lucide-react";
import { fetchVenue, fetchMyVenues, fetchBackupPlaylists, addBackupPlaylist, removeBackupPlaylist, fetchAnnouncements, createAnnouncement, deleteAnnouncement, updateAnnouncement, updateAnnouncementSettings, checkSuperAdmin, type Announcement } from "../lib/api";
import { useUpload } from "../hooks/use-upload";
import { useAuth } from "../hooks/use-auth";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { uploadFile, isUploading } = useUpload({});
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });
  
  const [selectedVenueCode, setSelectedVenueCode] = useState<string | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistError, setPlaylistError] = useState("");
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementName, setAnnouncementName] = useState("");
  const [announcementError, setAnnouncementError] = useState("");

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

  const { data: backupPlaylists = [] } = useQuery({
    queryKey: ["backupPlaylists", selectedVenue?.id],
    queryFn: () => fetchBackupPlaylists(selectedVenue!.id),
    enabled: !!selectedVenue?.id,
  });

  const { data: announcementsData } = useQuery({
    queryKey: ["announcements", selectedVenue?.id],
    queryFn: () => fetchAnnouncements(selectedVenue!.id),
    enabled: !!selectedVenue?.id,
  });
  const announcements = announcementsData?.announcements || [];

  const addPlaylistMutation = useMutation({
    mutationFn: (url: string) => addBackupPlaylist(selectedVenue!.id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenue?.id] });
      setShowPlaylistModal(false);
      setPlaylistUrl("");
      setPlaylistError("");
    },
    onError: (error: any) => {
      setPlaylistError(error.message || "Failed to add playlist");
    },
  });

  const removePlaylistMutation = useMutation({
    mutationFn: (playlistId: string) => removeBackupPlaylist(selectedVenue!.id, playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backupPlaylists", selectedVenue?.id] });
    },
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: (data: { name: string; audioUrl: string }) => 
      createAnnouncement(selectedVenue!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", selectedVenue?.id] });
      setShowAnnouncementModal(false);
      setAnnouncementName("");
      setAnnouncementError("");
    },
    onError: (error: any) => {
      setAnnouncementError(error.message || "Failed to create announcement");
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: (announcementId: number) => deleteAnnouncement(selectedVenue!.id, announcementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", selectedVenue?.id] });
    },
  });

  const toggleAnnouncementMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => 
      updateAnnouncement(selectedVenue!.id, id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", selectedVenue?.id] });
    },
  });

  const updateAnnouncementSettingsMutation = useMutation({
    mutationFn: (data: { frequencyType?: string | null; frequency?: number; playMode?: string }) => 
      updateAnnouncementSettings(selectedVenue!.id, data),
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
    if (!announcementName.trim()) {
      setAnnouncementError("Please enter a name for the announcement");
      return;
    }
    const result = await uploadFile(file);
    if (result?.objectPath) {
      createAnnouncementMutation.mutate({
        name: announcementName.trim(),
        audioUrl: result.objectPath,
      });
    }
  };

  if (authLoading || venuesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900 flex flex-col overflow-hidden">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
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
                      <button
                        onClick={() => removePlaylistMutation.mutate(playlist.id.toString())}
                        className="p-1 text-gray-400 hover:text-red-400 transition-colors"
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
                  Announcements ({announcements.length})
                </h3>
                <button
                  onClick={() => setShowAnnouncementModal(true)}
                  className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mb-3 p-3 bg-white/5 rounded-lg">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-gray-400 text-xs">Play:</label>
                    <select
                      value={selectedVenue.announcementFrequencyType || "disabled"}
                      onChange={(e) => updateAnnouncementSettingsMutation.mutate({ 
                        frequencyType: e.target.value === "disabled" ? null : e.target.value 
                      })}
                      className="px-2 py-1 text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="disabled" className="bg-gray-900">Disabled</option>
                      <option value="songs" className="bg-gray-900">Every X songs</option>
                      <option value="minutes" className="bg-gray-900">Every X min</option>
                      <option value="hourly" className="bg-gray-900">Hourly</option>
                    </select>
                  </div>
                  {selectedVenue.announcementFrequencyType && selectedVenue.announcementFrequencyType !== 'hourly' && (
                    <select
                      value={selectedVenue.announcementFrequency || 5}
                      onChange={(e) => updateAnnouncementSettingsMutation.mutate({ frequency: parseInt(e.target.value) })}
                      className="px-2 py-1 text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-indigo-500"
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
                  )}
                  <div className="flex items-center gap-1.5">
                    <label className="text-gray-400 text-xs">Order:</label>
                    <select
                      value={selectedVenue.announcementPlayMode || "sequential"}
                      onChange={(e) => updateAnnouncementSettingsMutation.mutate({ playMode: e.target.value })}
                      className="px-2 py-1 text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="sequential" className="bg-gray-900">Sequential</option>
                      <option value="random" className="bg-gray-900">Random</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto">
                {announcements.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-3 col-span-full">No announcements yet</p>
                ) : (
                  announcements.map((announcement: Announcement) => (
                    <div key={announcement.id} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                      <Volume2 className={`w-3 h-3 ${announcement.isActive ? 'text-green-400' : 'text-gray-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{announcement.name}</p>
                      </div>
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

            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 opacity-60 lg:col-span-2">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Speaker className="w-4 h-4" />
                Sonos Speakers
                <span className="text-xs bg-indigo-600/50 text-indigo-200 px-2 py-0.5 rounded-full ml-2">Coming Soon</span>
              </h3>
              <p className="text-gray-400 text-xs mt-2">
                Connect Sonos speakers to play music throughout your venue.
              </p>
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
