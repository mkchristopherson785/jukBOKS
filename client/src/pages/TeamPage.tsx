import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music2, LogOut, User, Plus, Users, Trash2, Mail, Shield, ArrowLeft } from "lucide-react";
import { fetchTeam, inviteTeamMember, removeTeamMember, checkSuperAdmin } from "../lib/api";
import { useAuth } from "../hooks/use-auth";

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const { data: superAdminCheck } = useQuery({
    queryKey: ["super-admin-check"],
    queryFn: checkSuperAdmin,
    enabled: isAuthenticated,
  });
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");

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

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteTeamMember(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteError("");
    },
    onError: (error: any) => {
      setInviteError(error.message || "Failed to invite member");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const handleInvite = () => {
    if (inviteEmail.trim()) {
      setInviteError("");
      inviteMutation.mutate(inviteEmail.trim());
    }
  };

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

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-bold text-white">Team Members</h1>
          </div>
          {teamData?.isOwner && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Invite Member
            </button>
          )}
        </div>

        <p className="text-gray-400 mb-6">
          Team members can view and manage all venues in your organization.
        </p>

        <div className="space-y-4">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{user?.email}</p>
              <p className="text-gray-400 text-sm">Owner</p>
            </div>
          </div>

          {teamData?.members?.map((member: any) => (
            <div key={member.id} className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                <Mail className="w-5 h-5 text-gray-300" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">{member.email}</p>
                <p className="text-gray-400 text-sm">
                  {member.joinedAt ? "Admin" : "Invited (pending)"}
                </p>
              </div>
              {teamData?.isOwner && (
                <button
                  onClick={() => removeMemberMutation.mutate(member.id)}
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  title="Remove member"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}

          {(!teamData?.members || teamData.members.length === 0) && (
            <p className="text-gray-500 text-center py-8">
              No team members yet. Invite people to help manage your venues.
            </p>
          )}
        </div>
      </main>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Invite Team Member</h2>
            <p className="text-gray-400 mb-4">
              Enter their email address. They'll be able to manage all your venues once they sign in.
            </p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-2"
              autoFocus
            />
            {inviteError && (
              <p className="text-red-400 text-sm mb-4">{inviteError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail("");
                  setInviteError("");
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {inviteMutation.isPending ? "Inviting..." : "Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
