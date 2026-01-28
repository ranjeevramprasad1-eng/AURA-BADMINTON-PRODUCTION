"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, User, Bell, Users, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export function BottomNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();

  // Hide BottomNav on tournament detail pages to prevent obstruction
  if (pathname?.startsWith("/tournaments/")) {
    return null;
  }

  // Unified nav items logic could be simplified, but keeping structure for now
  const navItems = [
    { href: "/tournaments", icon: Trophy, label: "Explore" },
    { href: "/friends", icon: Users, label: "Friends" },
    { href: "/notifications", icon: Bell, label: "Alerts", badge: unreadCount },
    { href: "/", icon: User, label: "Profile" }, // Home is Tournaments
  ];

  const isActive = (href) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  return (
    <nav className="fixed bottom-2 left-4 right-4 z-50 max-w-[500px] mx-auto pointer-events-none">
      <div className="pointer-events-auto glass rounded-2xl flex justify-around items-center h-16 p-1 m-4 shadow-xl backdrop-blur-xl border border-white/20 dark:border-white/10 bg-background/60 dark:bg-background/40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center flex-1 h-full transition-colors duration-300",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-primary/10 rounded-xl"
                  initial={false}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              
              <div className="relative z-10 flex flex-col items-center gap-1">
                <div className="relative">
                  <Icon className={cn("size-6 transition-transform duration-300", active && "scale-110")} />
                  {item.badge > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-4 w-4 flex items-center justify-center p-0 text-[10px] ring-2 ring-background shadow-sm"
                    >
                      {item.badge > 9 ? "9+" : item.badge}
                    </Badge>
                  )}
                </div>
                <span className={cn("text-[10px] font-medium", active ? "opacity-100" : "opacity-0 hidden")}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
