"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Trophy, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function TournamentManageNav() {
    const pathname = usePathname();
    const navItems = [
        { href: "/", icon: Trophy, label: "Referees" },
        { href: "/", icon: User, label: "Players" },
        { href: "/", icon: Users2, label: "Referees" },
    ];

    const isActive = (href) => {
        if (href === "/") return pathname === "/";
        return pathname?.startsWith(href);
    };

    return (
        <nav className="fixed bottom-2 left-4 right-4 z-50 max-w-[500px] mx-auto pointer-events-none">
            <div className="pointer-events-auto rounded-full flex justify-around items-center h-16 p-1 m-4 shadow border bg-white">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "relative flex flex-col items-center justify-center flex-1 h-full transition-colors duration-300",
                                !active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {!active && (
                                <motion.div
                                    layoutId="nav-pill"
                                    className="absolute inset-0 bg-primary/10 rounded-full"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            )}

                            <div className="relative z-10 flex flex-col items-center gap-1">
                                <div className="relative">
                                    <Icon className={cn("size-6 transition-transform duration-300", !active && "scale-110")} />
                                </div>
                                <span className={cn("text-[10px] font-medium", !active ? "opacity-100" : "opacity-0 hidden")}>
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
