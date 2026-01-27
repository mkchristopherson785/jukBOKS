import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Music2, Settings, QrCode, Tv, ExternalLink } from "lucide-react";
import { fetchVenue, fetchQueue, fetchQRCode, setupDemo } from "../lib/api";
import { QueueList } from "../components/QueueList";

export default function AdminPage() {
  const [venueCode, setVenueCode] = useState("demo-venue");
  const [isSettingUp, setIsSettingUp] = useState(false);

  const { data: venue, refetch: refetchVenue } = useQuery({
    queryKey: ["venue", venueCode],
    queryFn: () => fetchVenue(venueCode),
    enabled: !!venueCode,
  });

  const { data: queue } = useQuery({
    queryKey: ["queue", venueCode],
    queryFn: () => fetchQueue(venueCode),
    enabled: !!venueCode,
    refetchInterval: 5000,
  });

  const { data: qrData } = useQuery({
    queryKey: ["qrcode", venueCode],
    queryFn: () => fetchQRCode(venueCode),
    enabled: !!venueCode,
  });

  const handleSetupDemo = async () => {
    setIsSettingUp(true);
    try {
      await setupDemo();
      setVenueCode("demo-venue");
      refetchVenue();
    } catch (error) {
      console.error("Setup failed:", error);
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 backdrop-blur-lg bg-black/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Music2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Jukboks Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSetupDemo}
              disabled={isSettingUp}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isSettingUp ? "Setting up..." : "Setup Demo"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!venue ? (
          <div className="text-center py-20">
            <Settings className="w-16 h-16 mx-auto text-gray-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">No Venue Configured</h2>
            <p className="text-gray-400 mb-6">Click "Setup Demo" to create a demo venue</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                <h2 className="text-xl font-bold text-white mb-4">Venue: {venue.name}</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-xl">
                    <p className="text-gray-400 text-sm">Organization</p>
                    <p className="text-white font-medium">{venue.organizationName}</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl">
                    <p className="text-gray-400 text-sm">Daily Limit</p>
                    <p className="text-white font-medium">{venue.dailyRequestLimit} requests</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl">
                    <p className="text-gray-400 text-sm">Explicit Content</p>
                    <p className="text-white font-medium">{venue.allowExplicit ? "Allowed" : "Blocked"}</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl">
                    <p className="text-gray-400 text-sm">Venue Code</p>
                    <p className="text-white font-medium font-mono">{venue.code}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                <h2 className="text-xl font-bold text-white mb-4">Queue ({queue?.items?.length || 0} songs)</h2>
                <QueueList items={queue?.items || []} />
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
                <h2 className="text-xl font-bold text-white mb-4">Quick Links</h2>
                <div className="space-y-3">
                  <a
                    href={qrData?.partyUrl || `/party/${venueCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-indigo-600/20 rounded-xl hover:bg-indigo-600/30 transition-colors"
                  >
                    <QrCode className="w-6 h-6 text-indigo-400" />
                    <div className="flex-1">
                      <p className="text-white font-medium">Party Page</p>
                      <p className="text-gray-400 text-sm">Guest request interface</p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-gray-400" />
                  </a>
                  <a
                    href={`/kiosk/${venueCode}`}
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
                  <h2 className="text-xl font-bold text-white mb-4">QR Code</h2>
                  <div className="bg-white rounded-2xl p-4 flex flex-col items-center">
                    <img src={qrData.qrCode} alt="Party QR Code" className="w-48 h-48" />
                    <p className="text-gray-600 text-sm mt-2 text-center">
                      Scan to join the party
                    </p>
                  </div>
                  <p className="text-gray-400 text-xs mt-4 text-center break-all">
                    {qrData.partyUrl}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
