import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Music2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "../hooks/use-auth";
import { useMusicKit } from "../hooks/useMusicKit";
import { lookupPairingCode, submitPairing } from "../lib/api";

export default function PairPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { isConfigured, authorize, getMusicUserToken } = useMusicKit();

  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"enter" | "confirm" | "authorizing" | "saving" | "done" | "error">("enter");
  const [venueName, setVenueName] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code");
    if (c) setCode(c.replace(/\D/g, "").slice(0, 6));
  }, []);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code shown on your kiosk screen.");
      return;
    }
    if (!user) {
      window.location.href = `/api/login?return_to=${encodeURIComponent(`/pair?code=${code}`)}`;
      return;
    }
    try {
      const result = await lookupPairingCode(code);
      setVenueName(result.venueName);
      setStage("confirm");
    } catch (err: any) {
      setError(err.message || "Pairing code not found");
    }
  }

  async function handleConnect() {
    setError("");
    setStage("authorizing");
    try {
      const ok = await authorize();
      if (!ok) {
        setStage("confirm");
        setError("Apple Music sign-in was cancelled or failed.");
        return;
      }
      const token = getMusicUserToken();
      if (!token) {
        setStage("confirm");
        setError("Could not retrieve Apple Music token. Try again.");
        return;
      }
      setStage("saving");
      await submitPairing(code, token);
      setStage("done");
    } catch (err: any) {
      setStage("error");
      setError(err.message || "Pairing failed");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-purple-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 items-center justify-center mb-4">
            <Music2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Pair Apple Music</h1>
          <p className="text-gray-400">Connect your Apple Music account to your kiosk</p>
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
          {stage === "enter" && (
            <form onSubmit={handleLookup} className="space-y-4">
              <label className="block text-sm font-medium text-gray-300">
                Enter the 6-digit code shown on your kiosk
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono bg-black/30 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="000000"
                autoFocus
              />
              {error && (
                <div className="flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {authLoading ? (
                <div className="text-center text-gray-400 text-sm">Loading...</div>
              ) : !user ? (
                <p className="text-xs text-gray-400 text-center">
                  You'll be asked to sign in to Jukboks first.
                </p>
              ) : (
                <p className="text-xs text-gray-400 text-center">
                  Signed in as {user.email}
                </p>
              )}
              <button
                type="submit"
                disabled={code.length !== 6}
                className="w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
              >
                Continue
              </button>
            </form>
          )}

          {stage === "confirm" && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-gray-300 mb-1">Pair Apple Music with</p>
                <p className="text-2xl font-bold text-white">{venueName}</p>
              </div>
              <div className="text-sm text-gray-400 space-y-2">
                <p>When you tap Connect:</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Apple's sign-in popup will appear</li>
                  <li>Sign in with your Apple ID</li>
                  <li>Your kiosk will start using your Apple Music subscription</li>
                </ol>
              </div>
              {!isConfigured && (
                <p className="text-xs text-yellow-400 text-center">Loading Apple Music...</p>
              )}
              {error && (
                <div className="flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <button
                onClick={handleConnect}
                disabled={!isConfigured}
                className="w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-white font-semibold disabled:opacity-50 hover:scale-[1.02] transition-transform"
              >
                Connect Apple Music
              </button>
              <button
                onClick={() => { setStage("enter"); setError(""); }}
                className="w-full px-4 py-2 text-gray-400 text-sm hover:text-white"
              >
                Use a different code
              </button>
            </div>
          )}

          {(stage === "authorizing" || stage === "saving") && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-4" />
              <p className="text-white font-medium">
                {stage === "authorizing" ? "Waiting for Apple sign-in..." : "Saving to your kiosk..."}
              </p>
            </div>
          )}

          {stage === "done" && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">All set!</h2>
              <p className="text-gray-300 mb-6">
                {venueName} can now play Apple Music with your account. Your kiosk will pick this up within a few seconds.
              </p>
              <button
                onClick={() => setLocation("/admin")}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium"
              >
                Done
              </button>
            </div>
          )}

          {stage === "error" && (
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Pairing failed</h2>
              <p className="text-gray-300 mb-6">{error}</p>
              <button
                onClick={() => { setStage("enter"); setError(""); setCode(""); }}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
