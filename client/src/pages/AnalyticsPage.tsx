import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Music2, Users, Clock, TrendingUp, Mic2 } from "lucide-react";
import { useLocation } from "wouter";
import { fetchMyVenues, fetchVenueAnalytics } from "../lib/api";

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

export default function AnalyticsPage() {
  const [, setLocation] = useLocation();
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [days, setDays] = useState(30);

  const { data: venues = [] } = useQuery({
    queryKey: ["myVenues"],
    queryFn: fetchMyVenues,
  });

  const venueId = selectedVenueId || (venues.length > 0 ? venues[0].id : null);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["venueAnalytics", venueId, days],
    queryFn: () => fetchVenueAnalytics(venueId!, days),
    enabled: !!venueId,
  });

  const maxPeakCount = analytics?.peakHours?.length
    ? Math.max(...analytics.peakHours.map((h: any) => h.count))
    : 0;

  const maxDailyCount = analytics?.dailyPlays?.length
    ? Math.max(...analytics.dailyPlays.map((d: any) => d.count))
    : 0;

  return (
    <div className="min-h-screen bg-transparent flex flex-col overflow-hidden">
      <header className="border-b border-white/10 p-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button onClick={() => setLocation("/admin")} className="p-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-bold text-white">Analytics</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 overflow-auto w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          {venues.length > 1 && (
            <select
              value={venueId || ""}
              onChange={(e) => setSelectedVenueId(parseInt(e.target.value))}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {venues.map((v: any) => (
                <option key={v.id} value={v.id} className="bg-gray-900">{v.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  days === d
                    ? "bg-indigo-600 text-white"
                    : "bg-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : !analytics ? (
          <div className="text-center py-20 text-gray-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No analytics data available</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Music2 className="w-4 h-4 text-indigo-400" />
                  <span className="text-gray-400 text-sm">Songs Played</span>
                </div>
                <p className="text-3xl font-bold text-white">{analytics.totalPlayed}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-gray-400 text-sm">Guest Requests</span>
                </div>
                <p className="text-3xl font-bold text-white">{analytics.totalRequests}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span className="text-gray-400 text-sm">Unique Guests</span>
                </div>
                <p className="text-3xl font-bold text-white">{analytics.uniqueGuests}</p>
              </div>
            </div>

            {analytics.dailyPlays?.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-8">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  Daily Activity
                </h3>
                <div className="flex items-end gap-1 h-32">
                  {analytics.dailyPlays.map((day: any) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}: {day.count} songs
                      </div>
                      <div
                        className="w-full bg-indigo-500/60 rounded-t hover:bg-indigo-500/80 transition-colors min-h-[2px]"
                        style={{ height: `${maxDailyCount > 0 ? (day.count / maxDailyCount) * 100 : 0}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  {analytics.dailyPlays.length > 0 && (
                    <>
                      <span>{new Date(analytics.dailyPlays[0].date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      <span>{new Date(analytics.dailyPlays[analytics.dailyPlays.length - 1].date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Music2 className="w-4 h-4 text-indigo-400" />
                  Top Songs
                </h3>
                {analytics.topSongs?.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topSongs.map((song: any, i: number) => (
                      <div key={song.trackId} className="flex items-center gap-3">
                        <span className="text-gray-500 text-sm w-5 text-right font-mono">{i + 1}</span>
                        {song.albumCover ? (
                          <img src={song.albumCover} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                            <Music2 className="w-5 h-5 text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{song.title}</p>
                          <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                        </div>
                        <span className="text-indigo-400 text-sm font-medium">{song.count}x</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No data yet</p>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Mic2 className="w-4 h-4 text-purple-400" />
                  Top Artists
                </h3>
                {analytics.topArtists?.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topArtists.map((artist: any, i: number) => (
                      <div key={artist.artist} className="flex items-center gap-3">
                        <span className="text-gray-500 text-sm w-5 text-right font-mono">{i + 1}</span>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600/40 to-indigo-600/40 flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{artist.artist.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{artist.artist}</p>
                        </div>
                        <span className="text-purple-400 text-sm font-medium">{artist.count} plays</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No data yet</p>
                )}
              </div>
            </div>

            {analytics.peakHours?.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Peak Hours
                </h3>
                <div className="flex items-end gap-1 h-28">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const data = analytics.peakHours.find((h: any) => h.hour === hour);
                    const count = data?.count || 0;
                    return (
                      <div key={hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          {formatHour(hour)}: {count} songs
                        </div>
                        <div
                          className="w-full bg-amber-500/50 rounded-t hover:bg-amber-500/70 transition-colors min-h-[2px]"
                          style={{ height: `${maxPeakCount > 0 ? (count / maxPeakCount) * 100 : 0}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>12 AM</span>
                  <span>6 AM</span>
                  <span>12 PM</span>
                  <span>6 PM</span>
                  <span>11 PM</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
