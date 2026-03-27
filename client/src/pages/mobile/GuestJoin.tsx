import { useState } from "react";
import { Music2, ArrowRight, ArrowLeft } from "lucide-react";

interface GuestJoinProps {
  onJoin: (code: string) => void;
  onBack: () => void;
}

export default function GuestJoin({ onJoin, onBack }: GuestJoinProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a venue code");
      return;
    }
    setError("");
    onJoin(trimmed);
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6">
      <button
        onClick={onBack}
        className="absolute top-12 left-4 p-2 text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-6 h-6" />
      </button>

      <div className="mb-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
          <Music2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">Join a Party</h1>
        <p className="text-gray-400 mt-2 text-center text-sm">
          Enter the venue code or scan the QR code at the venue
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="Enter venue code"
            autoFocus
            className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white text-center text-2xl font-mono tracking-widest placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
        </div>

        <button
          type="submit"
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          Join Party
          <ArrowRight className="w-5 h-5" />
        </button>
      </form>

      <div className="mt-8 flex items-center gap-4 text-gray-500 text-sm">
        <div className="h-px flex-1 bg-white/10" />
        <span>or scan QR code at venue</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}
