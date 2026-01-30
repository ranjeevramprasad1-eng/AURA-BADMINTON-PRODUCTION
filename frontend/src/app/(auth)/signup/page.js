"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { uploadAvatar } from "@/lib/storage";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import {
  Mail,
  Lock,
  User,
  CalendarDays,
  Zap,
  ImagePlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const { signup, isSigningUp, signupError } = useAuth();

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setUploadError("Please select an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError("Image size must be less than 5MB");
        return;
      }
      setUploadError(null);
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploadError(null);
    if (password !== confirmPassword) return;

    let photoUrl = null;
    if (avatarFile) {
      try {
        setIsUploading(true);
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        photoUrl = await uploadAvatar(avatarFile, tempId);
      } catch (error) {
        setUploadError(error.message || "Failed to upload avatar");
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    signup({
      email,
      password,
      username,
      gender,
      dob: dob || null,
      photo_url: photoUrl,
    });
  };

  const passwordsMismatch = password && confirmPassword && password !== confirmPassword;

  return (
    <div className="flex min-h-screen flex-col max-w-[500px] mx-auto border-r border-l">
      <ScrollablePage className="h-dvh bg-background">
        <ScrollablePageHeader className="pb-0 bg-transparent">
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black italic tracking-tighter text-foreground">
                  AURA
                </span>
              </div>
            </div>
          </header>
        </ScrollablePageHeader>

        <ScrollablePageContent className="pb-24 pt-6 relative">
          <div className="absolute top-0 inset-x-0 h-48 bg-linear-to-b from-brand-blue/10 to-transparent skew-y-3 origin-top-left scale-110 pointer-events-none -z-10" />
          <div className="absolute top-0 right-0 size-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none -z-10" />

          <div className="px-4 space-y-8">
            <div className="space-y-1">
              <h1 className="text-xl font-black italic tracking-tighter uppercase text-muted-foreground/80">
                Create account
              </h1>
              <h2 className="text-3xl font-black italic tracking-tighter text-foreground">
                Sign up
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
                    minLength={6}
                    className="pl-9 bg-muted/40 border-transparent focus:bg-background focus:border-input transition-all rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Confirm password
                </label>
                <div className="relative group border border-border rounded-xl">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className={cn(
                      "pl-9 bg-muted/40 border-transparent focus:bg-background focus:border-input transition-all rounded-xl h-11",
                      passwordsMismatch && "focus:border-destructive border-destructive/50"
                    )}
                  />
                </div>
                {passwordsMismatch && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Username
                </label>
                <div className="relative group border border-border rounded-xl">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="pl-9 bg-muted/40 border-transparent focus:bg-background focus:border-input transition-all rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Date of birth
                </label>
                <div className="relative group border border-border rounded-xl">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                  <Input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    required
                    max={new Date().toISOString().split("T")[0]}
                    className="pl-9 bg-muted/40 border-transparent focus:bg-background focus:border-input transition-all rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm transition-all outline-none focus:bg-background focus:border-input focus:ring-2 focus:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Avatar <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
                </label>
                <div className="flex items-center gap-4">
                  {avatarPreview ? (
                    <div className="relative shrink-0">
                      <img
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="size-20 rounded-full object-cover border-2 border-border"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarFile(null);
                          setAvatarPreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="absolute -top-1 -right-1 size-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold hover:bg-destructive/90 transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="size-20 rounded-full border-2 border-dashed border-border bg-muted/30 flex items-center justify-center shrink-0">
                      <ImagePlus className="size-8 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="w-full text-sm file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-xs file:font-bold file:uppercase file:tracking-wider file:cursor-pointer cursor-pointer text-muted-foreground file:transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Max 5MB. JPG, PNG, GIF
                    </p>
                  </div>
                </div>
                {uploadError && (
                  <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <Zap className="size-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">{uploadError}</p>
                  </div>
                )}
              </div>

              {signupError && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2">
                  <Zap className="size-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{signupError.message}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSigningUp || isUploading || passwordsMismatch}
                className="w-full h-11 rounded-xl font-bold uppercase tracking-wider"
                size="lg"
              >
                {isUploading
                  ? "Uploading…"
                  : isSigningUp
                    ? "Creating account…"
                    : "Sign up"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </ScrollablePageContent>
      </ScrollablePage>
    </div>

  );
}
