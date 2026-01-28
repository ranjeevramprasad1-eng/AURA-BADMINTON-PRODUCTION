"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFriends } from "@/hooks/useFriends";
import { useMutation, useQuery } from "@tanstack/react-query";
import { playersApi } from "@/lib/api";
import { friendsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { ArrowLeft, Search, UserPlus, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

export default function FriendsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const { friends, pending, sendRequest, updateRequest, removeFriend, isLoading } = useFriends();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await playersApi.search(searchQuery);
      setSearchResults(response.data.data.players || []);
    } catch (error) {
      toast.error("Failed to search players");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const getFriendshipStatus = (playerId) => {
    // Check if they're friends
    const isFriend = friends.some((f) => {
      const friendPlayer = f.player || f.friend;
      return friendPlayer?.id === playerId;
    });

    if (isFriend) return "friend";

    // Check pending requests (sent)
    const sentRequest = pending.sent?.find((r) => {
      const friend = r.friend || {};
      return friend.id === playerId;
    });

    if (sentRequest) return "pending_sent";

    return "none";
  };

  const handleSendFriendRequest = async (playerId) => {
    try {
      await sendRequest(playerId);
      toast.success("Friend request sent!");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send friend request");
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

  const handleRejectRequest = async (requestId) => {
    try {
      await updateRequest({ id: requestId, status: "rejected" });
      toast.success("Friend request rejected");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject request");
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

  return (
    <ScrollablePage>
      <ScrollablePageHeader>
        <header className="sticky top-0 bg-white border-b z-10">
          <div className="grid grid-cols-3 items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-lg font-bold text-center">Friends</h1>
            <div className="w-10" />
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="space-y-4 p-4">
        {/* Search Section */}
        <form onSubmit={handleSearch} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search players by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={isSearching}>
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Search Results</h2>
            <div className="space-y-2">
              {searchResults.map((player) => {
                const status = getFriendshipStatus(player.id);
                return (
                  <Card key={player.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/players/${player.id}`}
                        className="flex items-center gap-3 flex-1"
                      >
                        {player.photo_url ? (
                          <img
                            src={player.photo_url}
                            alt={player.username}
                            className="size-12 rounded-full object-cover border-2 border-gray-200"
                          />
                        ) : (
                          <div className="size-12 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-gray-600">
                              {(player.username || "P")[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{player.username}</p>
                        </div>
                      </Link>
                      <div className="ml-4">
                        {status === "friend" && (
                          <Badge variant="secondary">Friend</Badge>
                        )}
                        {status === "pending_sent" && (
                          <Badge variant="outline">Request Sent</Badge>
                        )}
                        {status === "none" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendFriendRequest(player.id)}
                          >
                            <UserPlus className="size-4 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending Friend Requests */}
        {pending.received && pending.received.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Pending Requests</h2>
            <div className="space-y-2">
              {pending.received.map((request) => {
                const requestPlayer = request.player || {};
                return (
                  <Card key={request.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/players/${requestPlayer.id}`}
                        className="flex items-center gap-3 flex-1"
                      >
                        {requestPlayer.photo_url ? (
                          <img
                            src={requestPlayer.photo_url}
                            alt={requestPlayer.username}
                            className="size-12 rounded-full object-cover border-2 border-gray-200"
                          />
                        ) : (
                          <div className="size-12 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-gray-600">
                              {(requestPlayer.username || "P")[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{requestPlayer.username}</p>
                          <p className="text-xs text-gray-500">Wants to be friends</p>
                        </div>
                      </Link>
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          onClick={() => handleAcceptRequest(request.id)}
                        >
                          <UserCheck className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectRequest(request.id)}
                        >
                          <UserX className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Friends List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">My Friends</h2>
            <Badge variant="secondary">{friends.length}</Badge>
          </div>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading friends...</div>
          ) : friends.length > 0 ? (
            <div className="space-y-2">
              {friends.map((friendship) => {
                const friendPlayer = friendship.player || friendship.friend || {};
                return (
                  <Card key={friendship.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/players/${friendPlayer.id}`}
                        className="flex items-center gap-3 flex-1"
                      >
                        {friendPlayer.photo_url ? (
                          <img
                            src={friendPlayer.photo_url}
                            alt={friendPlayer.username}
                            className="size-12 rounded-full object-cover border-2 border-gray-200"
                          />
                        ) : (
                          <div className="size-12 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-gray-600">
                              {(friendPlayer.username || "F")[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{friendPlayer.username}</p>
                          <p className="text-xs text-gray-500">
                            Friends since{" "}
                            {new Date(friendship.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveFriend(friendship.id)}
                        className="ml-4"
                      >
                        <UserX className="size-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-8">
              <div className="flex flex-col items-center text-center">
                <Users className="size-12 text-gray-400 mb-4" />
                <p className="text-gray-500 mb-2">No friends yet</p>
                <p className="text-sm text-gray-400">
                  Search for players above to add them as friends
                </p>
              </div>
            </Card>
          )}
        </div>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}






