"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { tournamentsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MapPin, Calendar, Clock, Users, Star, ArrowLeft, Share2 } from "lucide-react";
import { formatTime, formatDateWithDay } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";

export default function TournamentInviteSignupPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token;
  const { user, isLoading: isAuthLoading, signupAsync, isSigningUp, signupError } = useAuth();
  const { data: userData, isLoading: isLoadingUser } = useUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // Fetch invite details (works for both authenticated and unauthenticated users)
  const { data: inviteData, isLoading: isLoadingInvite, error: inviteError } = useQuery({
    queryKey: ["tournament-invite", token],
    queryFn: async () => {
      const response = await tournamentsApi.getInviteByToken(token);
      return response.data.data;
    },
    enabled: !!token,
  });

  // Derive redirect flag from data (safe when inviteData is still loading)
  const isLoggedIn = !!user;
  const inviter = inviteData?.inviter;
  const isInviter = isLoggedIn && userData?.id === inviter?.id;
  const isTeamComplete = (inviteData?.team?.members?.length || 0) >= 2;
  const shouldRedirectToTournament =
    isLoggedIn &&
    !isInviter &&
    inviteData?.status === "pending" &&
    !isTeamComplete &&
    !!inviteData?.tournament_id;

  // Logged-in invitee: redirect to /tournaments/[id]?invite= (must run before any early return)
  useEffect(() => {
    if (!shouldRedirectToTournament) return;
    router.replace(`/tournaments/${inviteData.tournament_id}?invite=${encodeURIComponent(token)}`);
  }, [shouldRedirectToTournament, inviteData?.tournament_id, token, router]);

  // Handle join for existing/logged-in users
  const handleJoinTeam = async () => {
    setIsJoining(true);
    try {
      await tournamentsApi.acceptInviteByToken(token);
      toast.success("Successfully joined the tournament team!");
      router.push(`/tournaments/${inviteData?.tournament_id}`);
    } catch (error) {
      console.error("Failed to accept invite:", error);
      toast.error(error.response?.data?.message || "Failed to join team. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  // Handle signup for new users
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }


    // Sign up the user
    try {
      await signupAsync({
        email,
        password,
        username,
        gender,
        dob: dob || null,
      });

      // After successful signup, accept the invite
      // Wait a bit for the player record to be created
      setTimeout(async () => {
        try {
          await tournamentsApi.acceptInviteByToken(token);
          toast.success("Successfully joined the tournament team!");
          router.push(`/tournaments/${inviteData?.tournament_id}`);
        } catch (error) {
          console.error("Failed to accept invite:", error);
          toast.error("Account created but failed to accept invite. Please try accepting from notifications.");
          router.push("/");
        }
      }, 2000);
    } catch (error) {
      toast.error(error.message || "Failed to create account");
    }
  };

  // Show loading state (when logged in, also wait for user details to know if viewer is inviter)
  if (isLoadingInvite || isAuthLoading || (user && isLoadingUser)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-600">Loading invite details...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (!inviteData || inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="p-6 max-w-md w-full">
          <h2 className="text-xl font-bold mb-2">Invalid Invite</h2>
          <p className="text-gray-600 mb-4">This invite link is invalid or has expired.</p>
          <Button onClick={() => router.push("/")} className="w-full">
            Go to Home
          </Button>
        </Card>
      </div>
    );
  }

  const tournament = inviteData.tournament;
  const team = inviteData.team;
  const teamMemberCount = team?.members?.length || 0;

  if (shouldRedirectToTournament) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-600">Taking you to the tournament…</p>
        </div>
      </div>
    );
  }

  // Inviter opened their own link — they cannot accept; show message to share with partner
  if (isInviter) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="p-6 max-w-md w-full text-center border-border/50">
          <div className="mb-4 flex justify-center">
            <Share2 className="size-12 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">You sent this invite</h2>
          <p className="text-muted-foreground mb-4">
            Share this link with your partner so they can join the team. You cannot accept your own invite.
          </p>
          <Button onClick={() => router.push(`/tournaments/${inviteData.tournament_id}`)} className="w-full">
            View Tournament
          </Button>
        </Card>
      </div>
    );
  }

  // Check if invite is already accepted
  if (inviteData.status === "accepted") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="p-6 max-w-md w-full text-center border-border/50">
          <div className="mb-4 text-5xl">✅</div>
          <h2 className="text-xl font-bold mb-2">Invite Already Accepted</h2>
          <p className="text-muted-foreground mb-4">This invite has already been used.</p>
          <Button onClick={() => router.push(`/tournaments/${inviteData.tournament_id}`)} className="w-full">
            View Tournament
          </Button>
        </Card>
      </div>
    );
  }

  // Check if team is already complete (partner already joined)
  if (isTeamComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="p-6 max-w-md w-full text-center border-border/50">
          <div className="mb-4 text-5xl">👥</div>
          <h2 className="text-xl font-bold mb-2">Team Already Complete</h2>
          <p className="text-muted-foreground mb-4">
            This team already has {teamMemberCount} members and cannot accept more players.
          </p>
          {team?.members && team.members.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Current Team Members:</p>
              <div className="flex justify-center gap-2">
                {team.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
                    {member.player?.photo_url ? (
                      <img
                        src={member.player.photo_url}
                        alt={member.player?.username || "Player"}
                        className="size-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="size-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {member.player?.username?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    )}
                    <span className="text-sm font-medium">{member.player?.username || "Unknown"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Button onClick={() => router.push(`/tournaments/${inviteData.tournament_id}`)} className="w-full">
            View Tournament
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background max-w-[500px] border-r border-l mx-auto">
      {/* Hero Section - matches /tournaments/[id] */}
      <div className="relative h-[40vh] w-full overflow-hidden">
        {tournament?.image_url ? (
          <img
            src={tournament.image_url}
            alt={tournament.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-primary to-teal-600 relative flex items-center justify-center">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white to-transparent" />
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/60 to-transparent" />

        {/* Back button */}
        <header className="absolute top-0 left-0 right-0 z-20 pt-safe-top">
          <div className="flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/50 to-transparent">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
              className="rounded-full bg-background/20 backdrop-blur-md text-white hover:bg-background/40 hover:text-white"
            >
              <ArrowLeft className="size-5" />
            </Button>
          </div>
        </header>

        {/* Tournament title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
              Team Invite
            </span>
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-foreground mb-2 leading-none">
            {tournament?.name || "Tournament"}
          </h1>
          <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground flex-wrap">
            {inviter && (
              <div className="flex items-center gap-1.5">
                <Users className="size-4" />
                <span>Invited by {inviter.username}</span>
              </div>
            )}
            {tournament?.start_time && (
              <>
                <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-4" />
                  <span>{formatDateWithDay(tournament.start_time)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 space-y-6 pt-4 pb-8 max-w-lg mx-auto">
        {/* Quick Stats Row - matches /tournaments/[id] */}
        {tournament && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 flex flex-col items-center justify-center text-center">
              <Clock className="size-5 text-primary mb-1" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Time</span>
              <span className="text-xs font-bold">{tournament.start_time ? formatTime(tournament.start_time) : "TBD"}</span>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 flex flex-col items-center justify-center text-center">
              <MapPin className="size-5 text-primary mb-1" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Venue</span>
              <span className="text-xs font-bold truncate w-full">View Details</span>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border/50 flex flex-col items-center justify-center text-center">
              <Star className="size-5 text-primary mb-1" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Entry</span>
              <span className="text-xs font-bold">Free</span>
            </div>
          </div>
        )}

        {/* Description */}
        {tournament?.description && (
          <div className="space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">About Event</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {tournament.description}
            </p>
          </div>
        )}

        {/* Team Members */}
        {team && team.members && team.members.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Your Teammates</h3>
            <div className="grid gap-2">
              {team.members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 border border-border/50">
                  <div className="relative">
                    {member.player?.photo_url ? (
                      <img
                        src={member.player.photo_url}
                        alt={member.player?.username || "Player"}
                        className="size-10 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold border border-border">
                        {member.player?.username?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{member.player?.username || "Unknown"}</p>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Team Member</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Section */}
        <div className="space-y-4 pt-4">
          {isLoggedIn ? (
            /* Logged-in user view - Show join button */
            <>
              <div className="text-center p-4 bg-muted/20 rounded-xl border border-border/50">
                <p className="text-sm text-muted-foreground mb-1">Signed in as</p>
                <p className="font-bold text-foreground">{user.email}</p>
              </div>

              <Button
                onClick={handleJoinTeam}
                disabled={isJoining}
                className="w-full h-14 rounded-xl shadow-xl shadow-primary/25 text-lg font-black uppercase tracking-wide"
              >
                {isJoining ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Joining...
                  </span>
                ) : (
                  "Join Team"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Not you?{" "}
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Sign in with a different account
                </Link>
              </p>
            </>
          ) : (
            /* New user view - Show signup form */
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Create Account</h3>
                <p className="text-sm text-muted-foreground">
                  Sign up to join this tournament team
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-12"
                />
                <Input
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-12"
                />
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive">Passwords do not match</p>
                )}
                <Input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="h-12"
                />
                <Input
                  type="date"
                  placeholder="Date of Birth"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  max={new Date().toISOString().split("T")[0]}
                  className="h-12"
                />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                  className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-12 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>

                {signupError && (
                  <p className="text-sm text-destructive">{signupError.message}</p>
                )}

                <Button
                  type="submit"
                  disabled={
                    isSigningUp ||
                    (password && confirmPassword && password !== confirmPassword)
                  }
                  className="w-full h-14 rounded-xl shadow-xl shadow-primary/25 text-lg font-black uppercase tracking-wide"
                >
                  {isSigningUp ? "Creating account..." : "Sign up & Join Team"}
                </Button>
              </form>

              <p className="text-xs text-center text-muted-foreground">
                Already have an account?{" "}
                <Link href={`/login?redirect=/tournaments/invite/${token}`} className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

