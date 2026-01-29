import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Music2, LogOut, MapPin, Users, Palette, Settings, Shield, ListMusic } from "lucide-react";
import { fetchMyVenues, fetchTeam, checkSuperAdmin } from "../lib/api";
import { useAuth } from "../hooks/use-auth";

export default function AdminPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });

  const { data: teamData } = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeam,
    enabled: isAuthenticated,
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["myVenues"],
    queryFn: fetchMyVenues,
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const navItems = [
    {
      href: "/admin/venues",
      icon: MapPin,
      title: "Venues",
      description: "Manage your venues, create new ones, and configure venue settings",
      count: venues.length,
    },
    {
      href: "/admin/queue",
      icon: ListMusic,
      title: "Queue",
      description: "View song queues, play history, and manage banned songs",
    },
    {
      href: "/admin/team",
      icon: Users,
      title: "Team",
      description: "Invite team members to help manage your venues",
      count: teamData?.members?.length || 0,
    },
    ...(teamData?.isOwner ? [{
      href: "/admin/branding",
      icon: Palette,
      title: "Branding",
      description: "Customize your organization name, logo, and colors",
    }] : []),
    {
      href: "/admin/settings",
      icon: Settings,
      title: "Settings",
      description: "Configure backup playlists, announcements, and integrations",
    },
  ];

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

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 overflow-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-gray-400 mb-8">Manage your Jukboks organization</p>

        <div className="grid md:grid-cols-2 gap-4">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 hover:bg-white/10 hover:border-indigo-500/50 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/20 flex items-center justify-center group-hover:bg-indigo-600/30 transition-colors">
                  <item.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="px-2 py-0.5 bg-indigo-600/30 text-indigo-300 text-xs rounded-full">
                        {item.count}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mt-1">{item.description}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
