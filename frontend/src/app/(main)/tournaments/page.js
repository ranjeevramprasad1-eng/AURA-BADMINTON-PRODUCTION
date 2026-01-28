"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTournaments } from "@/hooks/useTournaments";
import { TournamentCard } from "@/components/tournaments/TournamentCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Zap, CalendarDays, Filter } from "lucide-react";
import { gamesApi } from "@/lib/api";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("active"); // "active" or "completed"
  const [selectedGameId, setSelectedGameId] = useState("");

  // Fetch games for filter
  const { data: gamesData } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const response = await gamesApi.getAll();
      return response.data.data;
    },
  });

  const games = gamesData?.games || [];

  // Build filters object
  const queryFilters = useMemo(() => {
    const filterObj = {};
    if (selectedGameId) {
      filterObj.game_id = selectedGameId;
    }
    return filterObj;
  }, [selectedGameId]);

  const { data: tournamentsData, isLoading, error } = useTournaments(queryFilters);

  const allTournaments = tournamentsData?.tournaments || [];

  // Filter and Group Tournaments
  const groupedTournaments = useMemo(() => {
    let filtered = allTournaments;

    // Helper: Check if tournament is effectively completed
    const isTournamentCompleted = (t) => {
      if (t.status === "completed" || t.status === "cancelled") return true;
      if (t.end_date) {
        const end = new Date(t.end_date);
        const now = new Date();
        const endOfDay = new Date(end);
        endOfDay.setHours(23, 59, 59, 999);
        return now > endOfDay;
      }
      return false;
    };

    // 1. Filter by Tab (Active vs Completed)
    if (activeTab === "completed") {
      filtered = filtered.filter(t => isTournamentCompleted(t));
    } else {
      // Active: Not completed
      filtered = filtered.filter(t => !isTournamentCompleted(t));
    }

    // 2. Filter by Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tournament) =>
          tournament.name?.toLowerCase().includes(query) ||
          tournament.venue?.name?.toLowerCase().includes(query) ||
          tournament.venue?.address?.toLowerCase().includes(query) ||
          tournament.game?.name?.toLowerCase().includes(query)
      );
    }

    // 3. Helper to check if tournament is Live
    const isLive = (t) => {
      if (!t.start_date || !t.end_date) return false;
      const now = new Date();
      const start = new Date(t.start_date);
      const end = new Date(t.end_date);
      return now >= start && now <= end;
    };

    // 4. Sort Tournaments
    filtered.sort((a, b) => {
      const dateA = new Date(a.start_date || 0);
      const dateB = new Date(b.start_date || 0);

      if (activeTab === "active") {
        return dateA - dateB; // Ascending (Soonest first) for Active
      } else {
        return dateB - dateA; // Descending (Newest first) for Completed
      }
    });

    // 5. Group by Date
    const groups = {};
    const liveTournaments = [];

    const formatDateKey = (dateStr) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    };

    filtered.forEach(t => {
      if (activeTab === "active" && isLive(t)) {
        liveTournaments.push(t);
      } else {
        const dateKey = t.start_date ? formatDateKey(t.start_date) : "Start Date TBD";
        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(t);
      }
    });

    return { live: liveTournaments, groups };
  }, [allTournaments, searchQuery, activeTab]);


  const handleGameFilterClick = (gameId) => {
    // If clicking same game, revert to All ("")
    // If clicking new game, set it
    setSelectedGameId((prev) => (prev === gameId ? "" : gameId));
  };


  return (
    <ScrollablePage className="bg-background">
      <ScrollablePageHeader className="pb-0 bg-transparent">
        {/* Header */}
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black italic tracking-tighter text-foreground">
                AURA
              </span>
            </div>
          </div>
        </header>

        {/* Search & Tabs */}
        <div className="px-4 pt-4 pb-2 space-y-4 bg-background/95 backdrop-blur-sm ">
          <div className="relative group border border-border rounded-xl ">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              type="text"
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/40 border-transparent focus:bg-background focus:border-input transition-all rounded-xl"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              {/* Left Heading */}
              <h2 className="text-xl font-black italic tracking-tighter uppercase text-muted-foreground/80">
                Tournaments
              </h2>

              {/* Active/Completed Toggle (SMALLER & COMPACT) */}
              <div className="flex p-0.5 bg-muted/40 rounded-lg shrink-0 border border-border/50 shadow-inner">
                <button
                  onClick={() => setActiveTab("active")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all uppercase tracking-wide ${activeTab === "active"
                    ? "bg-background text-primary shadow-sm ring-1 ring-border/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setActiveTab("completed")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all uppercase tracking-wide ${activeTab === "completed"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                >
                  Completed
                </button>
              </div>
            </div>

            {/* Game Filter (SMALLER & DOTTED) */}
            {games.length > 0 && (
              <div className="flex gap-2 w-full overflow-x-auto pb-1 scrollbar-none mask-fade-right">
                {/* ALL Button */}
                <Button
                  size="sm"
                  onClick={() => setSelectedGameId("")}
                  variant="outline"
                  className={`rounded-full h-8 text-[10px] font-bold uppercase tracking-wider border-2 shrink-0 transition-all duration-300 ${selectedGameId === ""
                    ? "border-primary bg-primary/5 text-primary shadow-sm"
                    : "border-dashed border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/30"
                    }`}
                >
                  All
                </Button>
                {games.map((game) => (
                  <Button
                    key={game.id}
                    size="sm"
                    onClick={() => handleGameFilterClick(String(game.id))}
                    variant="outline"
                    className={`rounded-full h-8 text-[10px] font-bold uppercase tracking-wider border-2 shrink-0 transition-all duration-300 ${selectedGameId === String(game.id)
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-dashed border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/30"
                      }`}
                  >
                    {game.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollablePageHeader>

      <ScrollablePageContent className="pb-24 pt-2 relative">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 inset-x-0 h-48 bg-linear-to-b from-brand-blue/10 to-transparent skew-y-3 origin-top-left scale-110 pointer-events-none -z-10" />
        <div className="absolute top-0 right-0 size-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none -z-10" />

        <div className="px-4 space-y-6 ">
          {isLoading && (
            <div className="space-y-4 pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 w-full bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <Zap className="size-8 text-destructive opacity-50" />
              <p className="text-muted-foreground text-sm">Failed to load tournaments.</p>
              <Button onClick={() => window.location.reload()} variant="outline" size="sm">Retry</Button>
            </div>
          )}

          {!isLoading && !error && (
            <>
              {/* Live Now Section */}
              {activeTab === "active" && groupedTournaments.live.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex size-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-2.5 bg-red-500"></span>
                    </span>
                    <h3 className="text-sm font-black uppercase tracking-widest text-red-500">Live Now</h3>
                  </div>
                  {groupedTournaments.live.map((tournament, idx) => (
                    <TournamentCard key={tournament.id} tournament={tournament} index={idx} />
                  ))}
                </div>
              )}

              {/* Date Groups */}
              {Object.keys(groupedTournaments.groups).map((dateKey) => (
                <div key={dateKey} className="space-y-3">
                  <div className="sticky -top-2 z-10 bg-background/95 backdrop-blur-sm py-2 -mx-4 px-4 border-b border-border/40">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <CalendarDays className="size-4" />
                      {dateKey}
                    </h3>
                  </div>
                  {groupedTournaments.groups[dateKey].map((tournament, idx) => (
                    <TournamentCard key={tournament.id} tournament={tournament} index={idx} />
                  ))}
                </div>
              ))}

              {/* Empty State */}
              {groupedTournaments.live.length === 0 && Object.keys(groupedTournaments.groups).length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="bg-muted/30 p-6 rounded-full">
                    <Filter className="size-10 text-muted-foreground/50" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">No tournaments found</h3>
                    <p className="text-xs text-muted-foreground">Try adjusting your filters.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollablePageContent>
    </ScrollablePage>
  );
}
