"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { useFriends } from "@/hooks/useFriends";
import { useTournamentInvites } from "@/hooks/useTournamentInvites";
import { tournamentsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Copy, Check, UserPlus, Link as LinkIcon, CheckCircle2, XCircle, QrCode, Users, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import QRCode from "qrcode";

export function TeamInviteDrawer({ open, onOpenChange, tournamentId, teamId }) {
  const queryClient = useQueryClient();
  const { data: userData } = useUser();
  const { friends, isLoading: isLoadingFriends } = useFriends();
  const { invites, acceptInviteAsync, isAcceptingInvite } = useTournamentInvites(tournamentId);
  const currentUserId = userData?.id ?? null;
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [shareableLink, setShareableLink] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const handleInviteFriend = async () => {
    if (!selectedFriendId) {
      toast.error("Please select a friend");
      return;
    }

    try {
      const payload = { invitee_id: selectedFriendId };
      if (teamId != null) payload.team_id = teamId;
      await tournamentsApi.invite(tournamentId, payload);
      toast.success("Invite sent!");
      setSelectedFriendId(null);
      queryClient.invalidateQueries({ queryKey: ["tournament-invites", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", tournamentId] });
      onOpenChange(false);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send invite");
    }
  };

  const handleGenerateLink = useCallback(async () => {
    try {
      setIsGeneratingLink(true);
      const response = await tournamentsApi.generateInviteLink(tournamentId, teamId != null ? { team_id: teamId } : {});
      if (response?.data?.data?.link) {
        const link = response.data.data.link;
        setShareableLink(link);
        const token = response.data.data.invite?.token ?? (link.replace(/^.*\/invite\//, "") || "");
        setInviteToken(token);
        toast.success("Link generated!");
        queryClient.invalidateQueries({ queryKey: ["tournament-invites", tournamentId] });
        queryClient.invalidateQueries({ queryKey: ["tournament-teams", tournamentId] });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to generate link");
    } finally {
      setIsGeneratingLink(false);
    }
  }, [tournamentId, teamId, queryClient]);

  const handleCopyLink = () => {
    if (shareableLink) {
      const fullUrl = `${window.location.origin}${shareableLink}`;
      navigator.clipboard.writeText(fullUrl);
      setLinkCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // QR code encodes /tournaments/[id]?invite=TOKEN so scanning opens tournament page with invite drawer
  const qrInviteUrl =
    typeof window !== "undefined" && tournamentId && inviteToken
      ? `${window.location.origin}/tournaments/${tournamentId}?invite=${encodeURIComponent(inviteToken)}`
      : "";

  useEffect(() => {
    if (!qrInviteUrl) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(qrInviteUrl, { width: 200, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [qrInviteUrl]);

  const pendingInvites = useMemo(
    () => invites?.filter((invite) => invite.status === "pending") || [],
    [invites]
  );
  // Pending shareable-link invite (we sent it, no specific invitee, has token) – show when reopening instead of creating new
  const existingPendingLinkInvite = useMemo(
    () =>
      pendingInvites.find(
        (inv) =>
          inv.inviter_id === currentUserId &&
          (inv.invitee_id == null || inv.invitee_id === undefined) &&
          inv.token
      ) ?? null,
    [pendingInvites, currentUserId]
  );

  // When drawer opens: show existing shareable link if one is pending, otherwise create one by default
  useEffect(() => {
    if (!open || !tournamentId) return;
    if (existingPendingLinkInvite?.token) {
      const link = `/tournaments/invite/${existingPendingLinkInvite.token}`;
      setShareableLink(link);
      setInviteToken(existingPendingLinkInvite.token);
    } else {
      handleGenerateLink();
    }
  }, [open, tournamentId, existingPendingLinkInvite?.token, handleGenerateLink]);

  const receivedInvites = useMemo(
    () => pendingInvites.filter((inv) => inv.invitee_id === currentUserId),
    [pendingInvites, currentUserId]
  );
  const sentInvites = useMemo(
    () => pendingInvites.filter((inv) => inv.inviter_id === currentUserId),
    [pendingInvites, currentUserId]
  );

  const handleAcceptInvite = async (inviteId) => {
    try {
      await acceptInviteAsync({ inviteId, status: "accepted" });
      toast.success("Invite accepted! You're now on the team.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to accept invite");
    }
  };
  const handleRejectInvite = async (inviteId) => {
    try {
      await acceptInviteAsync({ inviteId, status: "rejected" });
      toast.success("Invite declined.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to decline invite");
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] overflow-hidden flex flex-col max-w-[500px] mx-auto">
        <DrawerHeader>
          <DrawerTitle>Invite Partner</DrawerTitle>
          <DrawerDescription>
            Invite from friends or share a link and QR code
          </DrawerDescription>
        </DrawerHeader>

        <Tabs defaultValue="friends" className="flex-1 flex flex-col min-h-0 px-4 pb-4 ">
          <TabsList className="w-full h-11 p-1 bg-muted/30 rounded-lg grid grid-cols-2 mb-4 border">
            <TabsTrigger value="friends" className="rounded-md text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground transition-all gap-2">
              <Users className="size-4" />
              Friends
            </TabsTrigger>
            <TabsTrigger value="link" className="rounded-md text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground transition-all gap-2">
              <Share2 className="size-4" />
              Link & QR
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="mt-0 flex-1 overflow-y-auto space-y-4 min-h-0">
            {/* Invite from Friends List */}
            <div>
              <Label htmlFor="friend-select">Select Friend</Label>
              <div className="mt-2 space-y-2">
                {isLoadingFriends ? (
                  <p className="text-sm text-gray-500">Loading friends...</p>
                ) : friends.length === 0 ? (
                  <p className="text-sm text-gray-500">No friends yet. Add friends to invite them.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {friends.map((friend) => {
                      const friendPlayer = friend.player || friend.friend;
                      return (
                        <Card
                          key={friend.id}
                          className={`p-3 cursor-pointer transition-colors ${selectedFriendId === friendPlayer?.id
                            ? "bg-purple-100 border-purple-500"
                            : "hover:bg-gray-50"
                            }`}
                          onClick={() => setSelectedFriendId(friendPlayer?.id)}
                        >
                          <div className="flex items-center gap-3">
                            {friendPlayer?.photo_url ? (
                              <img
                                src={friendPlayer.photo_url}
                                alt={friendPlayer.username}
                                className="size-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="size-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-sm font-bold text-gray-600">
                                  {(friendPlayer?.username || "F")[0].toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="font-medium">{friendPlayer?.username}</p>
                            </div>
                            {selectedFriendId === friendPlayer?.id && (
                              <Check className="size-5 text-purple-600" />
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
              <Button
                className="w-full mt-3"
                onClick={handleInviteFriend}
                disabled={!selectedFriendId || isLoadingFriends}
              >
                <UserPlus className="size-4 mr-2" />
                Send Invite
              </Button>
            </div>

            {/* Invites to you – accept or reject */}
            {receivedInvites.length > 0 && (
              <div>
                <Label>Invites to you</Label>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                  {receivedInvites.map((invite) => {
                    const inviter = invite.inviter || {};
                    return (
                      <Card key={invite.id} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {inviter.photo_url ? (
                              <img
                                src={inviter.photo_url}
                                alt={inviter.username}
                                className="size-8 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-muted-foreground">
                                  {(inviter.username || "?")[0].toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {inviter.username || "Someone"} invited you
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(invite.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8"
                              onClick={() => handleAcceptInvite(invite.id)}
                              disabled={isAcceptingInvite}
                            >
                              <CheckCircle2 className="size-4 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => handleRejectInvite(invite.id)}
                              disabled={isAcceptingInvite}
                            >
                              <XCircle className="size-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}


          </TabsContent>

          <TabsContent value="link" className="mt-0 flex-1 overflow-y-auto space-y-4 min-h-0">
            {/* Shareable Link */}
            <div>
              <Label>Shareable Link</Label>
              <div className="mt-2 space-y-2">
                {shareableLink ? (
                  <div className="flex gap-2">
                    <Input
                      value={typeof window !== "undefined" ? `${window.location.origin}${shareableLink}` : shareableLink}
                      readOnly
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyLink}
                      title="Copy link"
                    >
                      {linkCopied ? (
                        <Check className="size-4 text-green-600" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleGenerateLink}
                    disabled={isGeneratingLink}
                  >
                    <LinkIcon className="size-4 mr-2" />
                    {isGeneratingLink ? "Generating..." : "Generate Shareable Link"}
                  </Button>
                )}
              </div>
            </div>

            {/* QR code */}
            <div>
              <Label className="flex items-center gap-2">
                <QrCode className="size-4" />
                QR Code
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Partner scans to open this tournament and accept the invite
              </p>
              {qrDataUrl ? (
                <div className="flex flex-col items-center p-4 bg-muted/30 rounded-xl border border-border/50">
                  <img src={qrDataUrl} alt="Invite QR code" className="size-48 rounded-lg" />
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Scan to join team
                  </p>
                </div>
              ) : shareableLink && inviteToken ? (
                <div className="p-4 bg-muted/20 rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
                  Generating QR…
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Generate a shareable link above to show a QR code.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}

