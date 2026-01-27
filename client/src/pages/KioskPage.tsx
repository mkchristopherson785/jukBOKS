import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Music2, Users } from "lucide-react";
import { fetchVenue, fetchNowPlaying, fetchQueue, fetchQRCode } from "../lib/api";
import { NowPlaying } from "../components/NowPlaying";

export default function KioskPage() {
  const { code } = useParams<{ code: string }>();

  const { data: venue } = useQuery({
    queryKey: ["venue", code],
    queryFn: () => fetchVenue(code!),
    enabled: !!code,
  });

  const { data: nowPlaying } = useQuery({
    queryKey: ["nowPlaying", code],
    queryFn: () => fetchNowPlaying(code!),
    enabled: !!code,
    refetchInterval: 3000,
  });

  const { data: queue } = useQuery({
    queryKey: ["queue", code],
    queryFn: () => fetchQueue(code!),
    enabled: !!code,
    refetchInterval: 5000,
  });

  const { data: qrData } = useQuery({
    queryKey: ["qrcode", code],
    queryFn: () => fetchQRCode(code!),
    enabled: !!code,
    staleTime: 1000 * 60 * 60,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex">
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="mb-8 flex items-center gap-4">
          {venue?.logoUrl ? (
            <img src={venue.logoUrl} alt="" className="h-16 w-auto" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Music2 className="w-10 h-10 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">{venue?.name || "Jukboks"}</h1>
            <p className="text-gray-400">{venue?.organizationName}</p>
          </div>
        </div>

        <NowPlaying
          title={nowPlaying?.title}
          artist={nowPlaying?.artist}
          albumCover={nowPlaying?.albumCover}
        />
      </div>

      <div className="w-96 bg-black/30 backdrop-blur-lg border-l border-white/10 p-6 flex flex-col">
        <h2 className="text-xl font-bold text-white mb-6">Up Next</h2>

        <div className="flex-1 overflow-y-auto space-y-3">
          {queue?.items?.slice(0, 8).map((item: any, index: number) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white/5 rounded-xl"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                {index + 1}
              </div>
              {item.albumCover ? (
                <img src={item.albumCover} alt="" className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center">
                  <Music2 className="w-5 h-5 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate text-sm">{item.title}</p>
                <p className="text-gray-400 text-xs truncate">{item.artist}</p>
              </div>
              <div className="flex items-center gap-1 text-indigo-400 text-sm">
                <Users className="w-4 h-4" />
                {item.voteCount}
              </div>
            </div>
          ))}

          {(!queue?.items || queue.items.length === 0) && (
            <div className="text-center text-gray-400 py-8">
              <Music2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No songs in queue</p>
            </div>
          )}
        </div>

        {qrData?.qrCode && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center">
              <img src={qrData.qrCode} alt="Scan to join" className="w-32 h-32" />
              <p className="text-gray-800 font-medium mt-2 text-center text-sm">
                Scan to request songs
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
