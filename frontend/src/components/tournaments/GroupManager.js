"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRightLeft,
  Users,
  AlertTriangle,
  UserCheck,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useTournamentEngine } from "@/hooks/useTournamentEngine";

/**
 * GroupManager - Component for tournament hosts to view and manage groups
 *
 * Features:
 * - View all groups with teams
 * - Swap teams between groups (before matches start)
 * - Initialize groups with different configurations
 * - View standings for each group
 */
export function GroupManager({ tournamentId }) {
  const {
    info,
    teams,
    standings,
    isLoading,
    initializeGroups,
    isInitializing,
    swapTeam,
    isSwapping,
    reset,
    isResetting,
  } = useTournamentEngine(tournamentId);

  const [selectedGroups, setSelectedGroups] = useState(2);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [targetGroup, setTargetGroup] = useState("");

  // Can only edit groups before matches start
  const canEditGroups =
    info?.stage === "registration" ||
    (info?.stage === "group_stage" && info?.current_round === 0);

  const handleInitialize = () => {
    initializeGroups(selectedGroups);
  };

  const handleSwapTeam = () => {
    if (!selectedTeam || !targetGroup) return;

    swapTeam({
      teamId: selectedTeam.team_id,
      fromGroup: selectedTeam.currentGroup,
      toGroup: targetGroup,
    });

    setSwapDialogOpen(false);
    setSelectedTeam(null);
    setTargetGroup("");
  };

  const openSwapDialog = (team, currentGroup) => {
    setSelectedTeam({ ...team, currentGroup });
    setSwapDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Calculate team and player counts
  const teamCount = teams?.teams?.length || 0;
  const playerCount = teamCount * 2; // Doubles = 2 players per team

  // Not initialized - show initialization UI
  if (!info?.groups) {
    return (
      <>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Initialize Groups
            </CardTitle>
            <CardDescription>
              Set up groups for the tournament. Teams will be distributed using
              snake draft based on ratings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">

            <div className="flex items-center gap-4 my-2 mb-4">
              <span className="text-sm font-medium">Number of Groups:</span>
              <Select
                value={String(selectedGroups)}
                onValueChange={(v) => setSelectedGroups(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 Groups</SelectItem>
                  <SelectItem value="4">4 Groups</SelectItem>
                  <SelectItem value="8">8 Groups</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Registration Stats */}
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-4 justify-between px-4 py-2 bg-muted/50 rounded-full border border-border w-full">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-xs">
                    <strong>{teamCount}</strong> teams
                  </span>
                </div>
                <div className="size-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <UserCheck className="size-4 text-muted-foreground" />
                  <span className="text-xs">
                    <strong>{playerCount}</strong> players
                  </span>
                </div>
              </div>
              <Button
                onClick={handleInitialize}
                disabled={isInitializing || teamCount < selectedGroups * 2}
                className="rounded-full"
                size="sm"
              >
                {isInitializing ?
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Initializing...
                  </span> :
                  <span className="flex items-center gap-2">
                    Start <ArrowRight className="size-4" />
                  </span>}
              </Button>
            </div>

            {teamCount > 0 && teamCount < selectedGroups * 2 && (
              <p className="text-sm text-destructive">
                Need at least {selectedGroups * 2} teams for {selectedGroups}{" "}
                groups. Currently have {teamCount}.
              </p>
            )}


          </CardContent>
        </Card>
      </>
    );
  }

  // Show groups
  const groups = teams?.groups || {};
  const groupLetters = Object.keys(groups).sort();

  return (
    <div className="space-y-2">
      {/* Header with actions */}
      {canEditGroups && (
        <div className="absolute top-6 right-0 flex items-center px-4">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => reset()}
            disabled={isResetting}
            className="rounded-full text-xs px-2 py-1"
          >
            {isResetting ? "Resetting..." : "Reset Groups"}
          </Button>
        </div>
      )}



      {/* Stage indicator */}
      <div className="flex items-center gap-2 px-4">
        <Badge variant={info.stage === "group_stage" ? "default" : "secondary"}>
          {info.stage?.replace("_", " ").toUpperCase()}
        </Badge>
        {info.current_round > 0 && (
          <Badge variant="outline">
            Round {info.current_round} / {info.total_group_rounds}
          </Badge>
        )}
        {!canEditGroups && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="size-3" />
            Locked
          </Badge>
        )}
      </div>

      {/* Registration Stats */}
      <div className="px-4 mt-4">
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 rounded-full border border-border w-fit">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-xs">
              <strong>{teamCount}</strong> teams
            </span>
          </div>
          <div className="size-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <UserCheck className="size-4 text-muted-foreground" />
            <span className="text-xs">
              <strong>{playerCount}</strong> players
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs">
              <strong>{groupLetters.length}</strong> groups
            </span>
          </div>
        </div>
      </div>

      {/* Groups tabs */}
      <Tabs defaultValue="All" className="w-full gap-0 mt-4 ">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1 rounded-none border-t-2 border-b-2 border-border ">
          <TabsTrigger value="All" className="flex-1 min-w-0">
            All
          </TabsTrigger>
          {groupLetters.map((groupKey) => (
            <TabsTrigger key={groupKey} value={groupKey} className="flex-1 min-w-0">
              {groupKey}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="All" className="mt-0 overflow-y-auto max-h-[50dvh]">
          <div className="space-y-2 p-2">
            {teamCount === 0 ? (
              <p className="text-muted-foreground text-sm">No teams</p>
            ) : (
              teams?.teams?.map((team, idx) => (
                <div
                  key={team.team_id}
                  className="flex items-center justify-between bg-background/40 border border-border"
                >
                  <div className="flex items-center w-full">
                    <span className="flex items-center justify-center text-sm font-medium text-muted-foreground size-12 text-center bg-gray-500/20 border border-border">
                      {idx + 1}
                    </span>
                    <div className="flex items-center justify-between w-full mx-2">
                      <div>
                        <p className="font-medium text-sm">{team.display_name}</p>
                        <div className="flex items-center gap-0.5">
                          <span className="text-xs text-muted-foreground">
                            {team.player1_name}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {team.player2_name}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {team.avg_rating?.toFixed(1) || "?"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
        {groupLetters.map((groupKey) => {
          const letter = groupKey.replace("Group ", "");
          const groupTeams = groups[groupKey] || [];
          const groupStandings = standings?.[groupKey] || [];

          return (
            <TabsContent key={groupKey} value={groupKey}>
              <div className="space-y-2 p-2">
                {groupTeams.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No teams</p>
                ) : (
                  groupTeams.map((team, idx) => {
                    const standing = groupStandings.find(
                      (s) => s.team_id === team.team_id
                    );

                    return (
                      <div
                        key={team.team_id}
                        className="flex items-center justify-between bg-background/40 border border-border"
                      >
                        <span className="flex items-center justify-center text-sm font-medium text-muted-foreground size-12 text-center bg-gray-500/20 border border-border">
                          {standing?.position || idx + 1}
                        </span>
                        <div className="flex items-center justify-between w-full mx-2">
                          <div>
                            <p className="font-medium text-sm">
                              {team.display_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Rating: {team.avg_rating?.toFixed(1) || "?"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {standing && (
                              <Badge
                                variant={
                                  standing.qualified ? "default" : "secondary"
                                }
                                className="text-xs"
                              >
                                {standing.wins}W - {standing.losses}L
                              </Badge>
                            )}

                            {canEditGroups && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => openSwapDialog(team, letter)}
                              >
                                <ArrowRightLeft className="size-4" />
                              </Button>
                            )}
                          </div>
                        </div>


                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Swap Team Dialog */}
      <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Swap Team</DialogTitle>
            <DialogDescription>
              Move {selectedTeam?.display_name} to a different group
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm mb-2">
              Current group: <strong>Group {selectedTeam?.currentGroup}</strong>
            </p>

            <div className="flex items-center gap-2">
              <span className="text-sm">Move to:</span>
              <Select value={targetGroup} onValueChange={setTargetGroup}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {groupLetters
                    .map((g) => g.replace("Group ", ""))
                    .filter((g) => g !== selectedTeam?.currentGroup)
                    .map((g) => (
                      <SelectItem key={g} value={g}>
                        Group {g}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSwapTeam}
              disabled={!targetGroup || isSwapping}
            >
              {isSwapping ? "Swapping..." : "Swap Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GroupManager;
