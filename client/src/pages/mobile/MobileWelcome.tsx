import { Music2, Mic2, Settings, QrCode } from "lucide-react";
import type { MobileRole } from "../../hooks/useMobileRole";

interface MobileWelcomeProps {
  onSelectRole: (role: MobileRole) => void;
}

export default function MobileWelcome({ onSelectRole }: MobileWelcomeProps) {
  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6">
      <div className="mb-10 flex flex-col items-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/30">
          <Music2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white">Jukboks</h1>
        <p className="text-gray-400 mt-2 text-center">Your venue's music, powered by your guests</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => onSelectRole("guest")}
          className="w-full p-5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl text-left transition-transform active:scale-[0.98] shadow-lg shadow-indigo-500/20"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Join a Party</h2>
              <p className="text-indigo-200 text-sm">Request songs & vote on what plays next</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelectRole("host")}
          className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl text-left transition-transform active:scale-[0.98] hover:bg-white/10"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">I'm a Host</h2>
              <p className="text-gray-400 text-sm">Manage your venues & control the music</p>
            </div>
          </div>
        </button>
      </div>

      <p className="text-gray-600 text-xs mt-10">Powered by Apple Music</p>
    </div>
  );
}
