"use client";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CheckCircle2, XCircle } from "lucide-react";

/**
 * Drawer shown when an invitee opens /tournaments/[id]?invite=TOKEN (e.g. from QR scan).
 * Displays invite details and Accept / Decline actions.
 */
export function InviteAcceptDrawer({
  open,
  onOpenChange,
  inviteData,
  onAccept,
  onReject,
  isAccepting,
}) {
  const inviter = inviteData?.inviter;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="overflow-hidden flex flex-col max-w-[500px] mx-auto ">
        <DrawerHeader>
          <DrawerTitle>Team Invite</DrawerTitle>
          <DrawerDescription>
            {inviter ? (
              <>
                <span className="font-medium text-foreground">
                  {inviter.username || inviter.name || "Someone"}
                </span>{" "}
                invited you to join their team for this tournament.
              </>
            ) : (
              "You were invited to join a team."
            )}
          </DrawerDescription>
        </DrawerHeader>
        {inviter && (
          <div className="px-4 py-2">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/50">
              {inviter.photo_url ? (
                <img
                  src={inviter.photo_url}
                  alt={inviter.username}
                  className="size-12 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="size-12 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground font-bold text-lg">
                  {(inviter.username || "?")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  {inviter.username || inviter.name || "Inviter"}
                </p>
                <p className="text-xs text-muted-foreground">Team partner</p>
              </div>
            </div>
          </div>
        )}
        <DrawerFooter className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            className="w-full"
            size="lg"
            disabled={isAccepting}
          >
            <XCircle className="size-4 mr-2" />
            Decline
          </Button>

          <Button onClick={onAccept} className="w-full" size="lg" disabled={isAccepting}>
            <CheckCircle2 className="size-4 mr-2" />
            {isAccepting ? "Accepting…" : "Accept Invite"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
