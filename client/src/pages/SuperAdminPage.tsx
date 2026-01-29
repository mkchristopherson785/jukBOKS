import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../hooks/use-auth";
import { checkSuperAdmin, fetchAllOrganizations, fetchAllVenues } from "../lib/api";
import { Building2, MapPin, ArrowLeft, Users, Calendar, ExternalLink } from "lucide-react";

export default function SuperAdminPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: superAdminCheck, isLoading: checkLoading } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: !!user,
  });

  const { data: orgsData, isLoading: orgsLoading, isError: orgsError } = useQuery({
    queryKey: ["super-admin-organizations"],
    queryFn: fetchAllOrganizations,
    enabled: superAdminCheck?.isSuperAdmin === true,
  });

  const { data: venuesData, isLoading: venuesLoading, isError: venuesError } = useQuery({
    queryKey: ["super-admin-venues"],
    queryFn: fetchAllVenues,
    enabled: superAdminCheck?.isSuperAdmin === true,
  });

  if (authLoading || checkLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-xl mb-4">Please log in to access this page.</p>
          <button
            onClick={() => navigate("/admin")}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!superAdminCheck?.isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-xl mb-4">Access denied. Super admin privileges required.</p>
          <button
            onClick={() => navigate("/admin")}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Go to Admin
          </button>
        </div>
      </div>
    );
  }

  const organizations = orgsData?.organizations || [];
  const venues = venuesData?.venues || [];

  const getOrgVenues = (orgId: number) => venues.filter((v: any) => v.organizationId === orgId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/admin")}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Super Admin</h1>
            <p className="text-gray-400">View all organizations and venues across the platform</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-indigo-400" />
              <div>
                <p className="text-2xl font-bold text-white">{organizations.length}</p>
                <p className="text-gray-400 text-sm">Organizations</p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="flex items-center gap-3">
              <MapPin className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-white">{venues.length}</p>
                <p className="text-gray-400 text-sm">Venues</p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold text-white">{user?.email}</p>
                <p className="text-gray-400 text-sm">Logged in as</p>
              </div>
            </div>
          </div>
        </div>

        {(orgsLoading || venuesLoading) ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
          </div>
        ) : (orgsError || venuesError) ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <p className="text-red-400 mb-2">Failed to load data</p>
            <p className="text-gray-400 text-sm">There was an error fetching organizations or venues. Please try refreshing the page.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {organizations.map((org: any) => (
              <div
                key={org.id}
                className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden"
              >
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {org.logoUrl ? (
                      <img src={org.logoUrl} alt={org.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-semibold text-white">{org.name}</h2>
                      <p className="text-gray-400 text-sm">/{org.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(org.createdAt).toLocaleDateString()}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      org.subscriptionStatus === 'active' ? 'bg-green-500/20 text-green-400' :
                      org.subscriptionStatus === 'trial' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {org.subscriptionStatus || 'trial'}
                    </span>
                  </div>
                </div>
                
                <div className="p-4">
                  {getOrgVenues(org.id).length === 0 ? (
                    <p className="text-gray-500 text-sm">No venues</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {getOrgVenues(org.id).map((venue: any) => (
                        <div
                          key={venue.id}
                          className="bg-white/5 rounded-lg p-3 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-white font-medium">{venue.name}</p>
                            <p className="text-gray-400 text-xs">Code: {venue.code}</p>
                          </div>
                          <a
                            href={`/party/${venue.code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {organizations.length === 0 && (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No organizations found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
