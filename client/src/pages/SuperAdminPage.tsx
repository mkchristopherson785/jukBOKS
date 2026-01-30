import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "../hooks/use-auth";
import { checkSuperAdmin, fetchAllOrganizations, fetchAllVenues, superAdminDeleteVenue, superAdminDeleteOrganization, superAdminGetVenueGuests } from "../lib/api";
import { Building2, ArrowLeft, Users, Calendar, ExternalLink, Trash2, MapPin, X } from "lucide-react";

export default function SuperAdminPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [venueToDelete, setVenueToDelete] = useState<{ id: number; name: string } | null>(null);
  const [orgToDelete, setOrgToDelete] = useState<{ id: number; name: string; venueCount: number } | null>(null);
  const [viewGuestsVenue, setViewGuestsVenue] = useState<{ id: number; name: string } | null>(null);
  const [guestsList, setGuestsList] = useState<any[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);

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

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: number) => superAdminDeleteVenue(venueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-venues"] });
      setVenueToDelete(null);
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (orgId: number) => superAdminDeleteOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-venues"] });
      setOrgToDelete(null);
    },
  });

  const handleViewGuests = async (venue: { id: number; name: string }) => {
    setViewGuestsVenue(venue);
    setLoadingGuests(true);
    try {
      const data = await superAdminGetVenueGuests(venue.id);
      setGuestsList(data.guests || []);
    } catch (error) {
      console.error("Failed to load guests:", error);
      setGuestsList([]);
    } finally {
      setLoadingGuests(false);
    }
  };

  if (authLoading || checkLoading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
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
      <div className="min-h-screen bg-transparent flex items-center justify-center">
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
    <div className="min-h-screen bg-transparent">
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
                  <div className="flex items-center gap-2 text-sm text-gray-400">
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
                    <button
                      onClick={() => setOrgToDelete({ id: org.id, name: org.name, venueCount: getOrgVenues(org.id).length })}
                      className="p-2 hover:bg-red-500/20 rounded transition-colors text-gray-400 hover:text-red-400"
                      title="Delete organization"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                            <button
                              onClick={() => handleViewGuests({ id: venue.id, name: venue.name })}
                              className="flex items-center gap-1 mt-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              <Users className="w-3 h-3" />
                              {venue.guestCount || 0} guests
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={`/party/${venue.code}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => setVenueToDelete({ id: venue.id, name: venue.name })}
                              className="p-2 hover:bg-red-500/20 rounded transition-colors text-gray-400 hover:text-red-400"
                              title="Delete venue"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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

      {venueToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-2">Delete Venue</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete <span className="text-white font-medium">{venueToDelete.name}</span>? 
              This will permanently remove all queue items, requests, and settings for this venue.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setVenueToDelete(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteVenueMutation.mutate(venueToDelete.id)}
                disabled={deleteVenueMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteVenueMutation.isPending ? "Deleting..." : "Delete Venue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {orgToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-2">Delete Organization</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete <span className="text-white font-medium">{orgToDelete.name}</span>? 
              {orgToDelete.venueCount > 0 && (
                <span className="text-red-400"> This will also delete {orgToDelete.venueCount} venue{orgToDelete.venueCount > 1 ? 's' : ''} and all their data.</span>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOrgToDelete(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteOrgMutation.mutate(orgToDelete.id)}
                disabled={deleteOrgMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteOrgMutation.isPending ? "Deleting..." : "Delete Organization"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewGuestsVenue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Guests - {viewGuestsVenue.name}</h3>
              <button
                onClick={() => { setViewGuestsVenue(null); setGuestsList([]); }}
                className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {loadingGuests ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
              </div>
            ) : guestsList.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No guests found</p>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-2">
                {guestsList.map((guest: any) => (
                  <div key={guest.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{guest.nickname || "Anonymous"}</p>
                      <p className="text-gray-400 text-xs">
                        {guest.requestCount || 0} requests • Last active: {guest.lastActiveAt ? new Date(guest.lastActiveAt).toLocaleString() : "Never"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
