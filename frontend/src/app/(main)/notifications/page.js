"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { useFriends } from "@/hooks/useFriends";
import { useTournamentInvites } from "@/hooks/useTournamentInvites";
import { tournamentsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { ArrowLeft, Check, X, Bell } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { updateRequestAsync } = useFriends();

  const acceptFriendRequestMutation = useMutation({
    mutationFn: ({ id }) => updateRequestAsync({ id, status: "accepted" }),
    onSuccess: (data, variables) => {
      toast.success(`${variables.userName} friend request accepted.`);
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || "Failed to accept friend request");
    },
  });

  const rejectFriendRequestMutation = useMutation({
    mutationFn: ({ id }) => updateRequestAsync({ id, status: "rejected" }),
    onSuccess: () => {
      toast.success("Friend request rejected");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || "Failed to reject friend request");
    },
  });

  const acceptTournamentInviteMutation = useMutation({
    mutationFn: ({ inviteId }) =>
      tournamentsApi.updateInvite(inviteId, { status: "accepted" }),
    onSuccess: (data, variables) => {
      toast.success("Tournament invite accepted");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-invites"] });
      // Navigate to tournament if we have the ID
      if (variables.tournamentId) {
        router.push(`/tournaments/${variables.tournamentId}`);
      }
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || "Failed to accept invite");
    },
  });

  const rejectTournamentInviteMutation = useMutation({
    mutationFn: ({ inviteId }) =>
      tournamentsApi.updateInvite(inviteId, { status: "rejected" }),
    onSuccess: () => {
      toast.success("Tournament invite rejected");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || "Failed to reject invite");
    },
  });

  const handleNotificationAction = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }

    if (notification.type === "friend_request") {
      // Friend request actions are handled by the buttons
      return;
    } else if (notification.type === "tournament_invite") {
      // Tournament invite actions are handled by the buttons
      return;
    }
  };

  const handleAcceptFriendRequest = (notification) => {
    markAsRead(notification.id);
    acceptFriendRequestMutation.mutate({
      id: parseInt(notification.reference_id),
      userName: notification.title,
    });
  };

  const handleRejectFriendRequest = (notification) => {
    markAsRead(notification.id);
    rejectFriendRequestMutation.mutate({
      id: parseInt(notification.reference_id),
    });
  };

  const handleAcceptTournamentInvite = (notification) => {
    markAsRead(notification.id);
    // Extract tournament ID from notification message or reference
    const inviteId = parseInt(notification.reference_id);
    acceptTournamentInviteMutation.mutate({
      inviteId,
      tournamentId: null, // Could be extracted from notification if stored
    });
  };

  const handleRejectTournamentInvite = (notification) => {
    markAsRead(notification.id);
    const inviteId = parseInt(notification.reference_id);
    rejectTournamentInviteMutation.mutate({
      inviteId,
    });
  };

  const groupedNotifications = {
    friend_requests: notifications.filter((n) => n.type === "friend_request" && !n.read),
    friend_accepted: notifications.filter((n) => n.type === "friend_accepted" && !n.read),
    tournament_invites: notifications.filter(
      (n) => n.type === "tournament_invite" && !n.read
    ),
    other: notifications.filter(
      (n) => !["friend_request", "friend_accepted", "tournament_invite"].includes(n.type) && !n.read
    ),
    read: notifications.filter((n) => n.read),
  };

  return (
    <ScrollablePage>
      <ScrollablePageHeader>
        <header className="sticky top-0 bg-white border-b z-10">
          <div className="grid grid-cols-3 items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-lg font-bold text-center">Notifications</h1>
            <div className="flex gap-2 items-center justify-end">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead()}
                  className="text-xs"
                >
                  Mark all read
                </Button>
              )}
            </div>
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="space-y-4 p-4">
        {unreadCount === 0 && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="size-12 text-gray-400 mb-4" />
            <p className="text-gray-500">No notifications</p>
          </div>
        ) : (
          <>
            {/* Friend Requests */}
            {groupedNotifications.friend_requests.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Friend Requests</h2>
                <div className="space-y-2">
                  {groupedNotifications.friend_requests.map((notification) => (
                    <Card
                      key={notification.id}
                      className={`p-4 ${!notification.read ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{notification.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAcceptFriendRequest(notification)}
                            disabled={
                              acceptFriendRequestMutation.isPending ||
                              rejectFriendRequestMutation.isPending
                            }
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRejectFriendRequest(notification)}
                            disabled={
                              acceptFriendRequestMutation.isPending ||
                              rejectFriendRequestMutation.isPending
                            }
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Friend Accepted */}
            {groupedNotifications.friend_accepted.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Friend Accepted</h2>
                <div className="space-y-2">
                  {groupedNotifications.friend_accepted.map((notification) => (
                    <Card
                      key={notification.id}
                      className={`p-4 ${!notification.read ? "bg-green-50" : ""}`}
                      onClick={() => {
                        if (!notification.read) {
                          markAsRead(notification.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{notification.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {!notification.read && (
                          <Badge variant="default" className="ml-4 bg-green-500">
                            New
                          </Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Tournament Invites */}
            {groupedNotifications.tournament_invites.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Tournament Invites</h2>
                <div className="space-y-2">
                  {groupedNotifications.tournament_invites.map((notification) => (
                    <Card
                      key={notification.id}
                      className={`p-4 ${!notification.read ? "bg-purple-50" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{notification.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAcceptTournamentInvite(notification)}
                            disabled={
                              acceptTournamentInviteMutation.isPending ||
                              rejectTournamentInviteMutation.isPending
                            }
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRejectTournamentInvite(notification)}
                            disabled={
                              acceptTournamentInviteMutation.isPending ||
                              rejectTournamentInviteMutation.isPending
                            }
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Other Notifications */}
            {groupedNotifications.other.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Other</h2>
                <div className="space-y-2">
                  {groupedNotifications.other.map((notification) => (
                    <Card
                      key={notification.id}
                      className={`p-4 ${!notification.read ? "bg-gray-50" : ""}`}
                      onClick={() => handleNotificationAction(notification)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{notification.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {!notification.read && (
                          <Badge variant="default" className="ml-4">
                            New
                          </Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Read Notifications */}
            {groupedNotifications.read.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Read</h2>
                <div className="space-y-2">
                  {groupedNotifications.read.map((notification) => (
                    <Card key={notification.id} className="p-4 opacity-60">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{notification.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </ScrollablePageContent>
    </ScrollablePage>
  );
}





