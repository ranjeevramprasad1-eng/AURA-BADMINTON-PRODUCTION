"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { courtsApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function TournamentStatsHeader({ tournamentName, category, tournamentId, venueId }) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [courts, setCourts] = useState([]);
  const [isLoadingCourts, setIsLoadingCourts] = useState(false);

  useEffect(() => {
    if (isDialogOpen && venueId) {
      setIsLoadingCourts(true);
      courtsApi
        .getAll(venueId)
        .then((response) => {
          setCourts(response.data?.data?.courts || []);
        })
        .catch((error) => {
          console.error("Error fetching courts:", error);
          setCourts([]);
        })
        .finally(() => {
          setIsLoadingCourts(false);
        });
    }
  }, [isDialogOpen, venueId]);

  const handleCourtClick = (courtId) => {
    setIsDialogOpen(false);
    router.push(`/view/${tournamentId}/${courtId}`);
  };

  return (
    <>
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="grid grid-cols-3 items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex flex-col items-center">
            <h1 className="text-lg font-bold text-center max-w-[356px] truncate">{tournamentName}</h1>
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <span>{category}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="justify-self-end"
            onClick={() => setIsDialogOpen(true)}
          >
            <Maximize2 className="size-5" />
          </Button>
        </div>
      </header>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Court</DialogTitle>
            <DialogDescription>
              Choose a court to view the live match
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {isLoadingCourts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : courts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No courts available
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {courts.map((court) => (
                  <Button
                    key={court.id}
                    variant="outline"
                    className="w-full justify-start h-auto py-4 px-4"
                    onClick={() => handleCourtClick(court.id)}
                  >
                    <div className="flex flex-col items-start w-full">
                      <span className="font-semibold text-base">
                        Court {court.court_number}
                      </span>
                      {court.venue?.name && (
                        <span className="text-sm text-muted-foreground">
                          {court.venue.name}
                        </span>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
