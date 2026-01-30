"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePlayer } from "@/hooks/usePlayer";
import { useFriends } from "@/hooks/useFriends";
import { useUser } from "@/hooks/useUser";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { ArrowLeft, UserPlus, UserCheck, UserX, Zap } from "lucide-react";
import { toast } from "sonner";

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const playerId = parseInt(params.id);
  const { data: player, isLoading } = usePlayer(playerId);
  const { data: currentUser } = useUser();
  const { friends, pending, sendRequest, updateRequest, removeFriend } = useFriends();

  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Check if this is the current user's profile by comparing username
  const isOwnProfile = currentUser?.username === player?.username;

  // Check friendship status
  const getFriendshipStatus = () => {
    if (!player) return null;

    // Check if they're friends
    const isFriend = friends.some((f) => {
      const friendPlayer = f.player || f.friend;
      return friendPlayer?.id === playerId;
    });

    if (isFriend) return "friend";

    // Check pending requests (sent by current user)
    const sentRequest = pending.sent?.find((r) => {
      const friend = r.friend || {};
      return friend.id === playerId;
    });

    if (sentRequest) return "pending_sent";

    // Check pending requests (received by current user)
    const receivedRequest = pending.received?.find((r) => {
      const requestPlayer = r.player || {};
      return requestPlayer.id === playerId;
    });

    if (receivedRequest) return "pending_received";

    return "none";
  };

  const friendshipStatus = getFriendshipStatus();

  // Calculate age from DOB
  const calculateAge = (dob) => {
    if (!dob) return null;
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSendFriendRequest = async () => {
    try {
      setIsSendingRequest(true);
      await sendRequest(playerId);
      toast.success("Friend request sent!");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send friend request");
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      await updateRequest({ id: requestId, status: "accepted" });
      toast.success("Friend request accepted!");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to accept request");
    }
  };

  const handleRemoveFriend = async (friendshipId) => {
    try {
      await removeFriend(friendshipId);
      toast.success("Friend removed");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to remove friend");
    }
  };

  if (isLoading) {
    return (
      <ScrollablePage className="bg-background">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60 h-14" />
        </ScrollablePageHeader>
        <ScrollablePageContent className="pb-24">
          <div className="flex flex-col items-center py-8">
            <div className="size-28 rounded-full bg-muted animate-pulse mb-4" />
            <div className="h-8 w-40 bg-muted animate-pulse rounded-md mb-2" />
            <div className="h-4 w-24 bg-muted animate-pulse rounded-md" />
            <div className="mt-6 w-[300px] h-32 bg-muted animate-pulse rounded-2xl" />
          </div>
          <div className="px-4 space-y-4">
            <div className="h-12 w-full bg-muted animate-pulse rounded-full" />
            <div className="h-20 w-full bg-muted animate-pulse rounded-xl" />
            <div className="h-20 w-full bg-muted animate-pulse rounded-xl" />
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  if (!player) {
    return (
      <ScrollablePage className="bg-background">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
            <div className="flex items-center justify-between px-4 py-3">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="size-5" />
              </Button>
              <h1 className="text-lg font-bold">Player Profile</h1>
              <div className="size-10" />
            </div>
          </header>
        </ScrollablePageHeader>
        <ScrollablePageContent className="pb-24 flex flex-col items-center justify-center px-4 text-center space-y-4">
          <div className="bg-muted p-4 rounded-full">
            <ArrowLeft className="size-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-black italic tracking-tighter text-foreground">Player not found</h2>
          <p className="text-muted-foreground text-sm">This player may no longer exist or the link is invalid.</p>
          <Button onClick={() => router.back()} className="rounded-full font-bold uppercase tracking-wider">
            Go back
          </Button>
        </ScrollablePageContent>
      </ScrollablePage>
    );
  }

  const age = calculateAge(player.dob);
  const aura = player.rating?.aura_mu || null;
  const friendship = friends.find((f) => {
    const friendPlayer = f.player || f.friend;
    return friendPlayer?.id === playerId;
  });
  const receivedRequest = pending.received?.find((r) => {
    const requestPlayer = r.player || {};
    return requestPlayer.id === playerId;
  });

  return (
    <ScrollablePage className="bg-background">
      <ScrollablePageHeader className="pb-0 bg-transparent">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <div className="flex items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-lg font-black italic tracking-tighter text-foreground">Player Profile</h1>
            <div className="size-10" />
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="pb-24">
        {/* Sporty Profile Header - match main page */}
        <div className="relative overflow-hidden mb-6">
          <div className="absolute top-0 inset-x-0 h-48 bg-linear-to-b from-brand-blue/10 to-transparent skew-y-3 origin-top-left scale-110 pointer-events-none -z-10" />
          <div className="absolute top-0 right-0 size-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none -z-10" />

          <div className="flex flex-col items-center pt-8 pb-4 relative z-10 px-4">
            {/* Avatar with "Pro Ring" - match main page */}
            <div className="relative mb-4 group">
              <div className="absolute -inset-1 bg-linear-to-br from-brand-blue via-primary to-brand-green rounded-full animate-in spin-in-3 duration-1000 opacity-80" />
              <div className="absolute -inset-1 bg-linear-to-br from-brand-blue via-primary to-brand-green rounded-full blur-sm opacity-50" />
              {player.photo_url ? (
                <img
                  src={player.photo_url}
                  alt={player.username || "Profile"}
                  className="size-32 rounded-full object-cover border-4 border-background relative z-10"
                />
              ) : (
                <div className="size-32 bg-background rounded-full flex items-center justify-center border-4 border-background relative z-10">
                  <span className="text-4xl font-black italic tracking-tighter text-muted-foreground">
                    {(player.username || "P")[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            <h2 className="text-3xl font-black italic tracking-tight uppercase text-foreground">
              {player.username || "Player"}
            </h2>
            <div className="capitalize flex items-center gap-3 mt-1 text-sm font-medium text-muted-foreground">
              <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md">
                {player.gender || "Other"}
              </span>
              {age != null && (
                <>
                  <span className="w-px h-3 bg-border" />
                  <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md">
                    {age} Yrs
                  </span>
                </>
              )}
            </div>
          </div>

          {/* AURA Rating Card - match main page style */}
          <div className="px-4">
            <Card className="relative overflow-hidden bg-foreground text-background border-none shadow-xl">
              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[10px_10px]" />
              <div className="absolute right-0 top-0 size-32 bg-linear-to-br from-primary to-transparent opacity-20 blur-2xl rounded-full transform translate-x-12 -translate-y-12" />
              <div className="relative z-10 p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-primary mb-1">
                    <Zap className="size-4 fill-primary" />
                    <span className="text-xs font-bold tracking-widest uppercase">
                      Doubles Rating
                    </span>
                  </div>
                  <div className="text-5xl font-black italic tracking-tighter leading-none">
                    {aura != null ? aura.toFixed(2) : "N/A"}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Friend Action Button */}
        {!isOwnProfile && (
          <div className="px-4 space-y-2">
            {friendshipStatus === "friend" && friendship && (
              <Button
                variant="outline"
                className="w-full rounded-xl font-bold uppercase tracking-wider h-11"
                onClick={() => handleRemoveFriend(friendship.id)}
              >
                <UserX className="size-4 mr-2" />
                Remove Friend
              </Button>
            )}
            {friendshipStatus === "pending_sent" && (
              <Button variant="outline" className="w-full rounded-xl font-bold uppercase tracking-wider h-11" disabled>
                <UserCheck className="size-4 mr-2" />
                Friend Request Sent
              </Button>
            )}
            {friendshipStatus === "pending_received" && receivedRequest && (
              <div className="space-y-2">
                <Button
                  className="w-full rounded-xl font-bold uppercase tracking-wider h-11"
                  onClick={() => handleAcceptRequest(receivedRequest.id)}
                >
                  <UserCheck className="size-4 mr-2" />
                  Accept Friend Request
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl font-bold uppercase tracking-wider h-11"
                  onClick={() => updateRequest({ id: receivedRequest.id, status: "rejected" })}
                >
                  Decline
                </Button>
              </div>
            )}
            {friendshipStatus === "none" && (
              <Button
                className="w-full rounded-xl font-bold uppercase tracking-wider h-11"
                onClick={handleSendFriendRequest}
                disabled={isSendingRequest}
              >
                <UserPlus className="size-4 mr-2" />
                {isSendingRequest ? "Sending…" : "Add Friend"}
              </Button>
            )}
          </div>
        )}

        {/* Additional Info - semantic colors, rounded-xl */}
        <div className="px-4 space-y-4 mt-6">
          {player.dob && (
            <Card className="p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date of Birth</span>
                <span className="text-sm font-medium text-foreground">
                  {new Date(player.dob).toLocaleDateString()}
                </span>
              </div>
            </Card>
          )}
          {player.created_at && (
            <Card className="p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Member Since</span>
                <span className="text-sm font-medium text-foreground">
                  {new Date(player.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            </Card>
          )}
        </div>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}

