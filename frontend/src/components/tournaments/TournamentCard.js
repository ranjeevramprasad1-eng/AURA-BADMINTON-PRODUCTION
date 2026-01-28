"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CalendarDays, Clock, MapPin, Users, Trophy, Zap } from "lucide-react";
import { formatTime, formatDate, getTournamentCategory } from "@/lib/utils";

export function TournamentCard({ tournament, index }) {
  const {
    id,
    name,
    start_date,
    end_date,
    registration_fee,
    venue,
    capacity,
    registered,
    registered_count,
    match_format,
    game,
  } = tournament;

  const isTournamentLive = () => {
    if (!start_date || !end_date) return false;
    const now = new Date();
    const startTime = new Date(start_date);
    const endTime = new Date(end_date);
    return now >= startTime && now <= endTime;
  };

  const getStatusBadge = () => {
    if (isTournamentLive()) {
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/20 animate-pulse gap-1">
          <Zap className="size-3 fill-destructive" /> LIVE
        </Badge>
      );
    }
    if (registered) {
      return <Badge className="bg-brand-green/20 text-brand-green-dark border-brand-green/30">REGISTERED</Badge>;
    }
    return <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">OPEN</Badge>;
  };

  const categoryLabel = getTournamentCategory(match_format);

  const registeredCount = registered_count || 0;
  const progress = capacity > 0 ? (registeredCount / capacity) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1, ease: "easeOut" }}
      whileHover={{ y: -4, transition: { duration: 0.4 } }}
    >
      <Link href={`/tournaments/${id}`}>
        <Card className="py-0 overflow-hidden border-border/50 hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-primary/10 group">
          <div className="flex flex-col sm:flex-row">
            {/* Artistic Placeholder / Image Area */}
            <div className="h-32 sm:h-auto sm:w-32 bg-linear-to-br from-brand-blue to-teal-600 relative shrink-0 flex items-center justify-center overflow-hidden">
               {/* Pattern overlay */}
               <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white to-transparent" />
               <Trophy className="text-white/30 size-12 transform -rotate-12 group-hover:scale-110 transition-transform duration-500" />
               
               <div className="absolute bottom-0 inset-x-0 bg-black/40 backdrop-blur-[2px] p-1 text-center">
                 <span className="text-[10px] font-black text-white uppercase tracking-wider">
                   {game?.name ? `${game.name} - ${categoryLabel}` : categoryLabel}
                 </span>
               </div>
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-black tracking-tight line-clamp-1 group-hover:text-primary transition-colors uppercase italic">
                      {name}
                    </CardTitle>
                    <div className="flex items-center text-xs text-muted-foreground gap-1 font-medium">
                       <MapPin className="size-3" />
                       <span className="line-clamp-1">{venue?.name || venue?.address || "Location TBD"}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge()}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border border-border/50">
                    <CalendarDays className="size-3.5 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground uppercase">{formatDate(start_date)}</span>
                      <span className="text-[10px] font-medium">Date</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border border-border/50">
                    <Clock className="size-3.5 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground uppercase">
                        {formatTime(start_date)}
                      </span>
                      <span className="text-[10px] font-medium">Start Time</span>
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="p-4 pt-0 flex items-center justify-between gap-4">
                 <div className="flex-1 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider text-[10px]">
                        <Users className="size-3" /> {registeredCount}/{capacity} Teams
                      </span>
                      <span className="font-black text-primary text-sm">
                        {registration_fee > 0 ? `₹${registration_fee}` : "Free"}
                      </span>
                    </div>
                    <Progress value={Math.min(progress, 100)} className="h-1.5 bg-muted [&>div]:bg-linear-to-r [&>div]:from-brand-blue [&>div]:to-brand-green" />
                 </div>
              </CardFooter>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
