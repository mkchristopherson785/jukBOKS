import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapPin, Plus, Trash2, Settings, QrCode, Tv, Copy, Check, LogOut, User, Shield, ArrowLeft, Music2, Unplug, Loader2, RefreshCw, Activity, Thermometer, MemoryStick, HardDrive, AlertTriangle, RotateCw } from "lucide-react";
import { fetchMyVenues, createVenue, deleteVenue, fetchVenue, updateVenue, fetchQRCode, fetchListeners, fetchTeam, checkSuperAdmin, connectAppleMusic, disconnectAppleMusic, restartKiosk } from "../lib/api";
import { useAuth } from "../hooks/use-auth";
import { useMusicKit } from "../hooks/useMusicKit";

export default function VenuesPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [selectedVenueCode, setSelectedVenueCode] = useState<string | null>(null);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appleMusicBusyVenueId, setAppleMusicBusyVenueId] = useState<number | null>(null);
  const [appleMusicError, setAppleMusicError] = useState<string>("");
  const [syncedVenueCode, setSyncedVenueCode] = useState<string | null>(null);
  const { isConfigured: musicKitReady, authorize, getMusicUserToken } = useMusicKit();

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

  const { data: teamData } = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeam,
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

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: number) => deleteVenue(venueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
      setSelectedVenueCode(null);
    },
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ venueId, data }: { venueId: number; data: any }) => updateVenue(venueId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venue", selectedVenueCode] });
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
    },
  });

  const [restartedVenueCode, setRestartedVenueCode] = useState<string | null>(null);
  const restartKioskMutation = useMutation({
    mutationFn: ({ venueId }: { venueId: number; code: string }) => restartKiosk(venueId),
    onSuccess: (_data, vars) => {
      setRestartedVenueCode(vars.code);
      setTimeout(() => setRestartedVenueCode((c) => (c === vars.code ? null : c)), 15000);
    },
  });

  const handleCreateVenue = () => {
    if (newVenueName.trim()) {
      createVenueMutation.mutate({ name: newVenueName.trim() });
    }
  };

  const handleDeleteVenue = (venueId: number, venueName: string) => {
    if (confirm(`Are you sure you want to delete "${venueName}"? This will permanently remove all requests, playlists, and party data for this venue.`)) {
      deleteVenueMutation.mutate(venueId);
    }
  };

  const handleConnectAppleMusic = async (venueId: number) => {
    setAppleMusicError("");
    setAppleMusicBusyVenueId(venueId);
    try {
      const ok = await authorize();
      if (!ok) {
        setAppleMusicError("Apple Music sign-in was cancelled or failed.");
        return;
      }
      const token = getMusicUserToken();
      if (!token) {
        setAppleMusicError("Could not retrieve Apple Music token. Try again.");
        return;
      }
      await connectAppleMusic(venueId, token);
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
    } catch (err: any) {
      setAppleMusicError(err.message || "Connect failed");
    } finally {
      setAppleMusicBusyVenueId(null);
    }
  };

  const handleDisconnectAppleMusic = async (venueId: number, venueName: string) => {
    if (!confirm(`Disconnect Apple Music from "${venueName}"? The kiosk will show a new pairing code.`)) return;
    setAppleMusicError("");
    setAppleMusicBusyVenueId(venueId);
    try {
      await disconnectAppleMusic(venueId);
      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
    } catch (err: any) {
      setAppleMusicError(err.message || "Disconnect failed");
    } finally {
      setAppleMusicBusyVenueId(null);
    }
  };

  const handleSettingChange = (field: string, value: any) => {
    if (selectedVenue) {
      updateVenueMutation.mutate({ venueId: selectedVenue.id, data: { [field]: value } });
    }
  };

  if (authLoading || venuesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
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

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 flex flex-col overflow-auto w-full">
        <div className="flex items-center gap-4 mb-6">
          <a
            href="/admin"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </a>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <MapPin className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-bold text-white">Venues</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Venue
          </button>
        </div>

        {venues.length === 0 ? (
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
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {venues.map((venue: any) => (
              <div
                key={venue.id}
                className={`p-6 rounded-xl bg-white/5 border transition-all ${
                  selectedVenueCode === venue.code
                    ? "border-indigo-500 bg-indigo-600/10"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">{venue.name}</h3>
                    <p className="text-gray-400 text-sm font-mono">{venue.code}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteVenue(venue.id, venue.name)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete venue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <a
                    href={`https://jukboks.com/party/${venue.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    Party
                  </a>
                  <a
                    href={`/kiosk/${venue.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                  >
                    <Tv className="w-4 h-4" />
                    Kiosk
                  </a>
                  <a
                    href={`/kiosk/${venue.code}?display=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm rounded-lg transition-colors"
                    title="Display-only kiosk view (no audio, no device locking — open on a TV/tablet/laptop)"
                  >
                    <Tv className="w-4 h-4" />
                    Display
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://jukboks.com/party/${venue.code}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    Copy Link
                  </button>
                </div>

                <div className="mb-3 p-3 bg-black/20 rounded-lg border border-white/5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Tv className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div className="text-xs font-medium text-white">Display Layout</div>
                    </div>
                    <select
                      value={(venue.kioskLayout as string) || "default"}
                      onChange={(e) => updateVenueMutation.mutate({ venueId: venue.id, data: { kioskLayout: e.target.value as "default" | "square" } })}
                      className="text-xs bg-black/40 border border-white/10 rounded-lg text-white px-2 py-1 focus:outline-none focus:border-blue-500"
                      data-testid={`select-layout-${venue.code}`}
                    >
                      <option value="default">Landscape (16:9)</option>
                      <option value="square">Square (1:1)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Music2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <div className="text-xs font-medium text-white" title="Where audio actually plays. 'MusicKit JS' is the current default (Chrome in the browser). 'Native Apple Music app' is a BETA path that drives the macOS Apple Music app via the audio agent — eliminates the Chrome memory leak but requires the Mac to be signed into Apple Music with a subscription. The native driver is not yet implemented; flipping this only sets the toggle.">
                        Playback Backend
                      </div>
                    </div>
                    <select
                      value={((venue as any).playbackBackend as string) || "musickit_js"}
                      onChange={(e) => updateVenueMutation.mutate({ venueId: venue.id, data: { playbackBackend: e.target.value } as any })}
                      className="text-xs bg-black/40 border border-white/10 rounded-lg text-white px-2 py-1 focus:outline-none focus:border-purple-500"
                      data-testid={`select-playback-backend-${venue.code}`}
                    >
                      <option value="musickit_js">MusicKit JS (browser)</option>
                      <option value="apple_music_native">Native Apple Music (BETA — coming soon)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Music2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div className="text-xs font-medium text-white">Audio Output</div>
                    </div>
                    {Array.isArray(venue.kioskAudioDevices) && venue.kioskAudioDevices.length > 0 ? (
                      <select
                        value={(venue.kioskAudioSink as string) || ""}
                        onChange={(e) => updateVenueMutation.mutate({ venueId: venue.id, data: { kioskAudioSink: e.target.value || null } })}
                        className="text-xs bg-black/40 border border-white/10 rounded-lg text-white px-2 py-1 focus:outline-none focus:border-blue-500 max-w-[180px]"
                        data-testid={`select-audio-${venue.code}`}
                      >
                        <option value="">Auto</option>
                        {venue.kioskAudioDevices.map((d: { name: string; description: string }) => (
                          <option key={d.name} value={d.name}>{d.description || d.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500" title="The Pi audio agent hasn't reported any devices yet. Install it on the Pi to enable this dropdown.">
                        Agent not installed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-shrink-0 w-[100px]">
                      <span className="text-xs font-medium text-white">Volume</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      defaultValue={(venue.kioskAudioVolume as number | undefined) ?? 65}
                      onMouseUp={(e) => updateVenueMutation.mutate({ venueId: venue.id, data: { kioskAudioVolume: Number((e.target as HTMLInputElement).value) } })}
                      onTouchEnd={(e) => updateVenueMutation.mutate({ venueId: venue.id, data: { kioskAudioVolume: Number((e.target as HTMLInputElement).value) } })}
                      className="flex-1 accent-blue-500"
                      data-testid={`slider-volume-${venue.code}`}
                    />
                    <span className="text-xs text-gray-300 w-10 text-right tabular-nums">
                      {(venue.kioskAudioVolume as number | undefined) ?? 65}%
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ["myVenues"] });
                      setSyncedVenueCode(venue.code);
                      setTimeout(() => setSyncedVenueCode((c) => (c === venue.code ? null : c)), 3000);
                    }}
                    className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-200 transition-colors"
                    data-testid={`button-sync-${venue.code}`}
                  >
                    {syncedVenueCode === venue.code ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Pi will apply within 10s
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sync to Pi now
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (restartKioskMutation.isPending) return;
                      if (!confirm("Restart the kiosk browser? Music will stop for ~10 seconds while it relaunches.")) return;
                      restartKioskMutation.mutate({ venueId: venue.id, code: venue.code });
                    }}
                    disabled={restartKioskMutation.isPending && restartKioskMutation.variables?.code === venue.code}
                    className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-50 border border-amber-500/30 rounded-lg text-amber-200 transition-colors"
                    data-testid={`button-restart-kiosk-${venue.code}`}
                    title="Sends a kill-Chromium signal to the Pi audio agent. Frees all browser memory and relaunches a fresh tab. Music stops for ~10s."
                  >
                    {restartedVenueCode === venue.code ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Restart sent — Pi will pick up within 10s
                      </>
                    ) : (
                      <>
                        <RotateCw className={`w-3.5 h-3.5 ${restartKioskMutation.isPending && restartKioskMutation.variables?.code === venue.code ? "animate-spin" : ""}`} />
                        Restart Kiosk Browser
                      </>
                    )}
                  </button>
                </div>

                {(() => {
                  const h: any = (venue as any).kioskHealth || {};
                  const updatedAt = (venue as any).kioskHealthUpdatedAt as string | null;
                  const ageSec = updatedAt ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000) : null;
                  const stale = ageSec === null || ageSec > 120;
                  const fmtAge = (s: number | null) => {
                    if (s === null) return "never";
                    if (s < 60) return `${s}s ago`;
                    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                    return `${Math.floor(s / 3600)}h ago`;
                  };
                  const fmtUptime = (s: number | null | undefined) => {
                    if (s == null) return "—";
                    if (s < 60) return `${s}s`;
                    if (s < 3600) return `${Math.floor(s / 60)}m`;
                    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
                    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
                  };
                  const tempColor = h.cpuTempC == null ? "text-gray-400" : h.cpuTempC >= 80 ? "text-red-400" : h.cpuTempC >= 70 ? "text-amber-400" : "text-green-400";
                  const memColor = h.memUsedPercent == null ? "text-gray-400" : h.memUsedPercent >= 90 ? "text-red-400" : h.memUsedPercent >= 75 ? "text-amber-400" : "text-green-400";
                  const chromeColor = h.chromiumMemMb == null ? "text-gray-400" : h.chromiumMemMb >= 1500 ? "text-red-400" : h.chromiumMemMb >= 1000 ? "text-amber-400" : "text-green-400";
                  const hasData = updatedAt !== null;
                  const warn = !stale && (
                    (h.cpuTempC != null && h.cpuTempC >= 80) ||
                    (h.memUsedPercent != null && h.memUsedPercent >= 90) ||
                    (h.chromiumMemMb != null && h.chromiumMemMb >= 1500) ||
                    (h.chromiumRunning === false)
                  );
                  return (
                    <div className={`mb-3 p-3 bg-black/20 rounded-lg border ${warn ? "border-amber-500/40" : "border-white/5"}`} data-testid={`pi-health-${venue.code}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Activity className={`w-4 h-4 flex-shrink-0 ${stale ? "text-gray-500" : warn ? "text-amber-400" : "text-emerald-400"}`} />
                          <div className="text-xs font-medium text-white">Kiosk Health</div>
                          {warn && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <span className={`text-[10px] ${stale ? "text-gray-500" : "text-gray-400"}`}>
                          {hasData ? fmtAge(ageSec) : "agent not installed"}
                        </span>
                      </div>
                      {!hasData ? (
                        <p className="text-[11px] text-gray-500">
                          Install (or re-install) the audio agent on the kiosk machine to enable health reporting:
                          <code className="block mt-1 text-[10px] text-blue-300 font-mono break-all">Mac: curl -fsSL https://jukboks.com/scripts/install-mac-audio-agent.sh | bash</code>
                          <code className="block mt-1 text-[10px] text-blue-300 font-mono break-all">Pi:  curl -fsSL https://jukboks.com/scripts/install-audio-agent.sh | bash</code>
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <Thermometer className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-400">CPU temp</span>
                            <span className={`ml-auto tabular-nums ${tempColor}`}>{h.cpuTempC != null ? `${h.cpuTempC}°C` : "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MemoryStick className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-400">Memory</span>
                            <span className={`ml-auto tabular-nums ${memColor}`}>{h.memUsedPercent != null ? `${h.memUsedPercent}%` : "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5" title="Total RSS across all Chromium processes">
                            <Music2 className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-400">Chromium RAM</span>
                            <span className={`ml-auto tabular-nums ${chromeColor}`}>
                              {h.chromiumRunning === false ? "not running" : h.chromiumMemMb != null ? `${Math.round(h.chromiumMemMb)} MB` : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <RefreshCw className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-400">Browser up</span>
                            <span className="ml-auto tabular-nums text-gray-200">{fmtUptime(h.chromiumUptimeSeconds)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <HardDrive className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-400">Disk used</span>
                            <span className="ml-auto tabular-nums text-gray-200">{h.diskUsedPercent != null ? `${h.diskUsedPercent}%` : "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-400">System up</span>
                            <span className="ml-auto tabular-nums text-gray-200">{fmtUptime(h.uptimeSeconds)}</span>
                          </div>
                        </div>
                      )}
                      {warn && (
                        <p className="mt-2 text-[10px] text-amber-300/90">
                          {h.chromiumRunning === false
                            ? "Browser is not running. The kiosk page is offline — wait for the autostart wrapper to relaunch (~3s), or use the Restart Kiosk Browser button above."
                            : (h.cpuTempC != null && h.cpuTempC >= 80)
                              ? "Kiosk machine is running hot. Improve airflow or move it out of direct sun."
                              : (h.chromiumMemMb != null && h.chromiumMemMb >= 1500)
                                ? "Browser is using a lot of memory — likely a MusicKit JS leak. Use the Restart Kiosk Browser button above, or wait for the agent's auto-restart to fire when no song is playing."
                                : "System memory is nearly full. Consider restarting the browser soon."}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="mb-3 p-3 bg-black/20 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Music2 className="w-4 h-4 text-pink-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white">Apple Music</div>
                        <div className="text-xs text-gray-400">
                          {venue.appleMusicConnected ? (
                            <span className="text-green-400">● Connected</span>
                          ) : (
                            <span className="text-gray-500">○ Not connected</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {venue.appleMusicConnected ? (
                      <button
                        onClick={() => handleDisconnectAppleMusic(venue.id, venue.name)}
                        disabled={appleMusicBusyVenueId === venue.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white/10 hover:bg-red-500/20 hover:text-red-300 rounded-lg text-gray-300 disabled:opacity-50"
                        data-testid={`button-disconnect-am-${venue.code}`}
                      >
                        {appleMusicBusyVenueId === venue.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Unplug className="w-3 h-3" />
                        )}
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnectAppleMusic(venue.id)}
                        disabled={!musicKitReady || appleMusicBusyVenueId === venue.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-pink-600/80 hover:bg-pink-600 rounded-lg text-white disabled:opacity-50"
                        data-testid={`button-connect-am-${venue.code}`}
                      >
                        {appleMusicBusyVenueId === venue.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Music2 className="w-3 h-3" />
                        )}
                        Connect
                      </button>
                    )}
                  </div>
                  {appleMusicBusyVenueId === venue.id && appleMusicError && (
                    <div className="text-xs text-red-400 mt-2">{appleMusicError}</div>
                  )}
                </div>

                <button
                  onClick={() => setLocation(`/admin/queue?venue=${venue.code}`)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  View Queue
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">Create New Venue</h2>
            <input
              type="text"
              value={newVenueName}
              onChange={(e) => setNewVenueName(e.target.value)}
              placeholder="Venue name..."
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateVenue()}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewVenueName("");
                }}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
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
    </div>
  );
}
