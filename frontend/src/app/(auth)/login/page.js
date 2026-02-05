"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  ScrollablePage,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import { Mail, Lock, Zap, Eye } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoggingIn, loginError } = useAuth();

  const handleSubmit = (e) => {
    e.preventDefault();
    login({ email, password });
  };

  return (
    <div className="flex min-h-svh flex-col max-w-[500px] mx-auto border-r border-l">
      <Link href="/browse" className={buttonVariants({ variant: "outline", size: "icon", className: "absolute top-4 right-4 text-xs text-muted-foreground hover:text-primary transition-colors" })}>
        <Eye />
      </Link>
      <ScrollablePage className="bg-transparent">
        <ScrollablePageContent className="pb-6 relative flex flex-col justify-end">
          <div className="relative m-4 text-black rounded-lg text-5xl font-black italic tracking-tighter uppercase text-center flex items-center justify-center flex-1">
            AURA
          </div>
          <div className="px-4 space-y-8">
            {/* Title block */}
            <div className="space-y-1">
              <h1 className="text-xl font-black italic tracking-tighter uppercase text-muted-foreground/80">
                Welcome back
              </h1>
              <h2 className="text-3xl font-black italic tracking-tighter text-foreground">
                Log in
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Email
                </label>
                <div className="relative group border border-border rounded-xl">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9 bg-muted/40 border-transparent focus:bg-background focus:border-input transition-all rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <div className="relative group border border-border rounded-xl">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-9 bg-muted/40 border-transparent focus:bg-background focus:border-input transition-all rounded-xl h-11"
                  />
                </div>
              </div>

              {loginError && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2">
                  <Zap className="size-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{loginError.message}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full h-12 rounded-full font-bold uppercase tracking-wider text-base"
                size="lg"
              >
                {isLoggingIn ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Need an account?{" "}
              <Link
                href="/signup"
                className="font-semibold text-primary hover:underline"
              >
                Sign up
              </Link>
            </p>
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    </div>

  );
}
