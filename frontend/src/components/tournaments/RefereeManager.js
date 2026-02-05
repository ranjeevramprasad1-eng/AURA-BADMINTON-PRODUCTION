"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tournamentsApi, playersApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus, Users, Search, X, User } from "lucide-react";
import { toast } from "sonner";

/**
 * RefereeManager - Component for tournament hosts to manage referees.
 * Renders the content for the Referees drawer (list, add, remove).
 */
export function RefereeManager({ tournamentId }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: async () => {
      const response = await tournamentsApi.getById(tournamentId);
      return response.data.data;
    },
  });

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["player-search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return { players: [] };
      const response = await playersApi.search(searchQuery);
      return response.data.data;
    },
    enabled: searchQuery.length >= 2 && isSearchDialogOpen,
  });

  const addRefereeMutation = useMutation({
    mutationFn: (playerId) =>
      tournamentsApi.addReferee(tournamentId, playerId),
    onSuccess: () => {
      toast.success("Referee added successfully!");
      setIsSearchDialogOpen(false);
      setSearchQuery("");
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to add referee";
      toast.error(errorMessage);
    },
  });

  const removeRefereeMutation = useMutation({
    mutationFn: (playerId) =>
      tournamentsApi.removeReferee(tournamentId, playerId),
    onSuccess: () => {
      toast.success("Referee removed successfully!");
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (error) => {
      const errorMessage =
        error?.response?.data?.message || "Failed to remove referee";
      toast.error(errorMessage);
    },
  });

  const referees = tournament?.referee || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full size-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-4">


      {referees.length === 0 ? (
        <Card className="p-8 text-center border-2 border-dashed border-border/50 bg-muted/5 rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-muted/30 flex items-center justify-center">
              <User className="size-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              No referees added yet
            </p>
          </div>
        </Card>
      ) : (
        <div className="max-h-[50dvh] overflow-y-auto grid grid-cols-2 gap-2">
          {referees.map((referee, index) => (
            <div
              key={referee.player_id ?? index}
              className="border border-border bg-background/80 backdrop-blur-sm hover:bg-background transition-colors rounded-full"
            >
              <div className="flex items-center justify-between ">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center shrink-0">
                    <User className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">
                      {referee.name || "Unknown"}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                      Referee
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (
                      confirm(
                        `Are you sure you want to remove ${referee.name} as a referee?`
                      )
                    ) {
                      removeRefereeMutation.mutate(referee.player_id);
                    }
                  }}
                  disabled={removeRefereeMutation.isPending}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full size-12"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={isSearchDialogOpen}
        onOpenChange={setIsSearchDialogOpen}
      >
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="gap-2 font-bold border-primary/40 w-full rounded-full bg-primary/10 text-primary h-12 text-sm uppercase tracking-wider"
          >
            <UserPlus className="size-4" />
            Add Referee
          </Button>
        </DialogTrigger>
        <DialogContent className="border-border/50">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight">
              Add Referee
            </DialogTitle>
            <DialogDescription>
              Search for a player to add as a referee
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/40 border-transparent focus:bg-background focus:border-input rounded-xl"
              />
            </div>
            {isSearching && (
              <div className="text-center py-4 text-muted-foreground">
                Searching...
              </div>
            )}
            {searchResults?.players && searchResults.players.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.players.map((player) => (
                  <Card
                    key={player.id}
                    className="p-3 cursor-pointer hover:bg-muted/50 transition-colors border-border rounded-none shadow-none"
                    onClick={() => {
                      addRefereeMutation.mutate(player.id);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {player.photo_url ? (
                        <img
                          src={player.photo_url}
                          alt={player.username}
                          className="size-12 rounded-full object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className="size-12 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center shrink-0">
                          <Users className="size-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-bold text-sm">
                          {player.username}
                        </p>
                        {player.name && player.name !== player.username && (
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                            {player.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {searchQuery.length >= 2 &&
              !isSearching &&
              searchResults?.players &&
              searchResults.players.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  No players found
                </div>
              )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSearchDialogOpen(false);
                setSearchQuery("");
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RefereeManager;
