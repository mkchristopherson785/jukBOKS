import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, LogOut, Upload, Palette, Shield, ArrowLeft } from "lucide-react";
import { fetchTeam, fetchMyOrganization, updateOrganization, checkSuperAdmin } from "../lib/api";
import { useUpload } from "../hooks/use-upload";
import { useAuth } from "../hooks/use-auth";

export default function BrandingPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { uploadFile, isUploading } = useUpload({});
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: teamData } = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeam,
    enabled: isAuthenticated,
  });

  const { data: organization } = useQuery({
    queryKey: ["myOrganization"],
    queryFn: fetchMyOrganization,
    enabled: isAuthenticated,
  });

  const updateOrgMutation = useMutation({
    mutationFn: updateOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myOrganization"] });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!teamData?.isOwner) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex flex-col items-center justify-center">
        <p className="text-white text-xl mb-4">Only the organization owner can access branding settings.</p>
        <a href="/admin" className="text-indigo-400 hover:text-indigo-300">Back to Dashboard</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 flex flex-col overflow-hidden">
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

      <main className="max-w-4xl mx-auto px-4 py-6 flex-1 flex flex-col overflow-auto w-full">
        <div className="flex items-center gap-4 mb-6">
          <a
            href="/admin"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </a>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <Palette className="w-8 h-8 text-indigo-400" />
          <h1 className="text-3xl font-bold text-white">Branding</h1>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Organization Name</h3>
            <input
              type="text"
              defaultValue={organization?.name || ""}
              onBlur={(e) => {
                if (e.target.value !== organization?.name) {
                  updateOrgMutation.mutate({ name: e.target.value });
                }
              }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500"
              placeholder="Your Organization Name"
            />
          </div>

          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Colors</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 text-xs mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={organization?.primaryColor || "#2563eb"}
                    onChange={(e) => updateOrgMutation.mutate({ primaryColor: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={organization?.primaryColor || "#2563eb"}
                    onChange={(e) => updateOrgMutation.mutate({ primaryColor: e.target.value })}
                    className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={organization?.accentColor || "#f59e0b"}
                    onChange={(e) => updateOrgMutation.mutate({ accentColor: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={organization?.accentColor || "#f59e0b"}
                    onChange={(e) => updateOrgMutation.mutate({ accentColor: e.target.value })}
                    className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 md:col-span-2">
            <h3 className="text-lg font-semibold text-white mb-3">Logo</h3>
            <div className="flex items-center gap-4">
              {organization?.logoUrl ? (
                <img src={organization.logoUrl} alt="Logo" className="h-12 w-auto rounded-lg bg-white/10 p-1" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center">
                  <Music2 className="w-6 h-6 text-gray-500" />
                </div>
              )}
              <div className="flex-1">
                <input
                  type="text"
                  defaultValue={organization?.logoUrl || ""}
                  onBlur={(e) => {
                    if (e.target.value !== organization?.logoUrl) {
                      updateOrgMutation.mutate({ logoUrl: e.target.value || undefined });
                    }
                  }}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 text-sm"
                  placeholder="Logo URL (or upload below)"
                />
              </div>
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors text-sm">
                <Upload className="w-4 h-4" />
                {isUploading ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const result = await uploadFile(file);
                      if (result?.objectPath) {
                        updateOrgMutation.mutate({ logoUrl: result.objectPath });
                      }
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
