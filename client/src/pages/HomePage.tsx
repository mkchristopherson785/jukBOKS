import { useState } from "react";
import { useLocation } from "wouter";
import { Music2, Users, Tv, Zap, QrCode, ArrowRight, LogIn, LogOut, User, ThumbsUp, Ban, ListMusic, Megaphone, Headphones, Shield, Building2 } from "lucide-react";
import { setupDemo } from "../lib/api";
import { useAuth } from "../hooks/use-auth";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();

  const handleDemo = async () => {
    setIsLoading(true);
    try {
      const result = await setupDemo();
      if (result.success && result.partySession) {
        setLocation(`/party/${result.partySession.code}`);
      }
    } catch (error) {
      console.error("Demo setup failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900">
      <header className="border-b border-white/10 backdrop-blur-lg bg-black/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/assets/logo-full.png" alt="Jukboks" className="h-12" />
          </div>
          <div className="flex items-center gap-4">
            {authLoading ? (
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : isAuthenticated ? (
              <>
                <button
                  onClick={() => setLocation("/admin")}
                  className="px-4 py-2 text-white hover:text-indigo-300 font-medium transition-colors"
                >
                  Dashboard
                </button>
                <div className="flex items-center gap-2 text-gray-300">
                  {user?.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline">{user?.firstName || user?.email}</span>
                </div>
                <a
                  href="/api/logout"
                  className="px-4 py-2 text-gray-300 hover:text-white font-medium transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </a>
              </>
            ) : (
              <>
                <a
                  href="/api/login"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-full transition-all flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-20">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Let Your Guests
            <span className="block bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Pick the Music
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-10">
            Jukboks is a complete music request platform powered by Apple Music. 
            Guests search, request, and vote on songs while you maintain full control. 
            Perfect for bars, restaurants, gyms, HOAs, and events.
          </p>
          <button
            onClick={handleDemo}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-lg font-semibold rounded-full transition-all shadow-lg shadow-indigo-500/30"
          >
            {isLoading ? "Setting up..." : "Launch Demo Party"}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <FeatureCard
            icon={<QrCode className="w-8 h-8" />}
            title="QR Code Access"
            description="Guests scan a QR code to join the party and start requesting songs instantly - no app download required"
          />
          <FeatureCard
            icon={<ThumbsUp className="w-8 h-8" />}
            title="Voting System"
            description="Let the crowd decide what plays next with upvotes and downvotes on song requests"
          />
          <FeatureCard
            icon={<Tv className="w-8 h-8" />}
            title="Kiosk Display"
            description="Beautiful full-screen now playing display for TVs and monitors with queue preview"
          />
          <FeatureCard
            icon={<Headphones className="w-8 h-8" />}
            title="Listen Along"
            description="Remote users with Apple Music subscriptions can sync and listen to the venue's music in real-time"
          />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          <FeatureCard
            icon={<ListMusic className="w-8 h-8" />}
            title="Backup Playlists"
            description="Set up to 10 Apple Music playlists to auto-play when the request queue is empty"
          />
          <FeatureCard
            icon={<Ban className="w-8 h-8" />}
            title="Song Banning"
            description="Ban inappropriate songs and prevent duplicates within 2 hours of playing"
          />
          <FeatureCard
            icon={<Megaphone className="w-8 h-8" />}
            title="Announcements"
            description="Schedule pre-recorded audio announcements to play between songs at custom intervals"
          />
          <FeatureCard
            icon={<Shield className="w-8 h-8" />}
            title="Content Control"
            description="Filter explicit content, set daily request limits, and auto-approve or moderate requests"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-20">
          <FeatureCard
            icon={<Building2 className="w-8 h-8" />}
            title="Multi-Venue Management"
            description="Create and manage multiple venues under one organization with unique settings for each location"
          />
          <FeatureCard
            icon={<Users className="w-8 h-8" />}
            title="Team Collaboration"
            description="Invite team members by email to help manage venues with shared admin access"
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8" />}
            title="API Integration"
            description="Embed Jukboks in your existing apps using our REST API with secure API key authentication"
          />
          <FeatureCard
            icon={<Music2 className="w-8 h-8" />}
            title="Full Apple Music Library"
            description="Access millions of songs from the complete Apple Music catalog for your guests to request"
          />
        </div>

        <div className="bg-white/5 backdrop-blur-lg rounded-3xl border border-white/10 p-8 md:p-12 mb-12">
          <h2 className="text-3xl font-bold text-white mb-8">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step number={1} title="Create a Venue">
              Set up your venue with custom settings for explicit content, request limits, backup playlists, and announcements.
            </Step>
            <Step number={2} title="Share QR Code">
              Display the QR code at your venue. Guests scan to join and can immediately start searching and requesting songs.
            </Step>
            <Step number={3} title="Play Music">
              Songs are queued based on votes. Use the kiosk display to show what's playing now and coming up next.
            </Step>
          </div>
        </div>

        <div className="bg-amber-900/20 backdrop-blur-lg rounded-2xl border border-amber-500/30 p-6 md:p-8">
          <h3 className="text-lg font-semibold text-amber-300 mb-3">Important Notice</h3>
          <ul className="text-gray-300 space-y-2 text-sm">
            <li><strong>Apple Music Subscription Required:</strong> Jukboks requires a valid Apple Music subscription to stream full songs. Without a subscription, only 30-second previews are available.</li>
            <li><strong>Copyright & Licensing:</strong> Jukboks does not provide public performance licenses. Venues are responsible for obtaining any necessary music licensing (such as ASCAP, BMI, SESAC, or other performance rights organizations) required to play music in public spaces.</li>
          </ul>
        </div>
      </main>

      <footer className="bg-black py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-400">
          <p>&copy; {new Date().getFullYear()} Jukboks. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 hover:border-indigo-500/50 transition-all">
      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold mb-4">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{children}</p>
    </div>
  );
}
