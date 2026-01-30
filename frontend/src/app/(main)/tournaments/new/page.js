"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { tournamentsApi, venuesApi, gamesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
  FieldDescription,
} from "@/components/ui/field";
import {
  ScrollablePage,
  ScrollablePageHeader,
  ScrollablePageContent,
} from "@/components/layout/ScrollablePage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trophy,
  MapPin,
  Users,
  Calendar,
  DollarSign,
  Image,
  FileText,
  Settings,
  Layers,
  RotateCcw,
} from "lucide-react";

// Tournament format options
const TOURNAMENT_FORMATS = [
  {
    value: 'swiss',
    label: 'Swiss System',
    description: 'Players are paired based on points and ratings. Dynamic team formation each round.'
  },
  {
    value: 'group_knockout',
    label: 'Group Stage + Knockout',
    description: 'Teams play in groups (round-robin), then top teams advance to knockout stage.'
  },
];

// Validation schema
const formSchema = z
  .object({
    name: z.string().min(1, "Tournament name is required"),
    description: z.string().min(1, "Description is required"),
    tournament_format: z.enum(['swiss', 'group_knockout']).default('swiss'),
    game_id: z
      .string()
      .min(1, "Game is required")
      .transform((val) => {
        const num = parseInt(val);
        if (isNaN(num)) throw new Error("Invalid game ID");
        return num;
      }),
    venue_id: z
      .string()
      .min(1, "Venue is required")
      .transform((val) => {
        const num = parseInt(val);
        if (isNaN(num)) throw new Error("Invalid venue ID");
        return num;
      }),
    match_format: z.object({
      eligible_gender: z.enum(["M", "W", "MW"], {
        required_error: "Eligible gender is required",
      }),
      min_age: z
        .string()
        .optional()
        .transform((val) => {
          if (!val || val === "") return undefined;
          const num = parseInt(val);
          return isNaN(num) ? undefined : num;
        }),
      max_age: z
        .string()
        .optional()
        .transform((val) => {
          if (!val || val === "") return undefined;
          const num = parseInt(val);
          return isNaN(num) ? undefined : num;
        }),
      metadata: z.object({
        set_rules: z.object({
          final: z.object({
            best_of: z.string().transform((val) => parseInt(val) || 7),
          }),
          semi_final: z.object({
            best_of: z.string().transform((val) => parseInt(val) || 5),
          }),
          league: z.object({
            _rounds: z.string().transform((val) => parseInt(val) || 4),
            best_of: z.string().transform((val) => parseInt(val) || 3),
          }),
        }),
      }),
    }),
    start_time: z.string().min(1, "Start time is required"),
    end_time: z.string().min(1, "End time is required"),
    capacity: z
      .string()
      .min(1, "Capacity is required")
      .transform((val) => {
        const num = parseInt(val);
        if (isNaN(num) || num < 1)
          throw new Error("Capacity must be a positive number");
        return num;
      }),
    registration_fee: z
      .string()
      .default("0")
      .transform((val) => {
        const num = parseFloat(val || "0");
        return isNaN(num) ? 0 : num;
      }),
    image_url: z.string().url().optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.match_format.min_age && data.match_format.max_age) {
        return data.match_format.max_age >= data.match_format.min_age;
      }
      return true;
    },
    {
      message: "Max age must be greater than or equal to min age",
      path: ["match_format", "max_age"],
    }
  )
  .refine(
    (data) => {
      const startTime = new Date(data.start_time);
      const endTime = new Date(data.end_time);
      return endTime > startTime;
    },
    {
      message: "End time must be after start time",
      path: ["end_time"],
    }
  );

export default function CreateTournamentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState(null);

  // Set default datetime values (1 hour ahead for start, 2 hours for end)
  const formatDateTimeLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const now = new Date();
  const startTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour ahead
  const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours ahead

  // Fetch venues
  const { data: venuesData, isLoading: venuesLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const response = await venuesApi.getAll();
      return response.data.data;
    },
  });

  const venues = venuesData?.venues || [];

  // Fetch games
  const { data: gamesData, isLoading: gamesLoading } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const response = await gamesApi.getAll();
      return response.data.data;
    },
  });

  const games = gamesData?.games || [];

  // Create tournament mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const response = await tournamentsApi.create(data);
      return response.data.data;
    },
    onSuccess: (data) => {
      toast.success("Tournament created successfully!");
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      router.push(`/tournaments/${data.tournament.id}`);
    },
    onError: (error) => {
      console.log(error);
      toast.error(
        error.response?.data?.message || "Failed to create tournament"
      );
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      tournament_format: "swiss",
      game_id: "",
      venue_id: "",
      match_format: {
        eligible_gender: "MW",
        min_age: "",
        max_age: "",
        metadata: {
          set_rules: {
            final: {
              best_of: "7",
            },
            semi_final: {
              best_of: "5",
            },
            league: {
              _rounds: "4",
              best_of: "3",
            },
          },
        },
      },
      start_time: formatDateTimeLocal(startTime),
      end_time: formatDateTimeLocal(endTime),
      capacity: "",
      registration_fee: "0",
      image_url: "",
    },
    validators: {
      onChange: formSchema,
      onBlur: formSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        // Parse and validate with Zod schema to get transformed values
        const parsed = formSchema.parse(value);

        // Build metadata object
        const metadata = {
          set_rules: {
            final: {
              best_of:
                parseInt(value.match_format.metadata.set_rules.final.best_of) ||
                7,
            },
            semi_final: {
              best_of:
                parseInt(
                  value.match_format.metadata.set_rules.semi_final.best_of
                ) || 5,
            },
            league: {
              _rounds:
                parseInt(
                  value.match_format.metadata.set_rules.league._rounds
                ) || 4,
              best_of:
                parseInt(
                  value.match_format.metadata.set_rules.league.best_of
                ) || 3,
            },
          },
        };

        // Prepare submit data - ensure all numeric values are actually numbers
        const submitData = {
          name: parsed.name,
          description: parsed.description,
          game_id: Number(parsed.game_id),
          venue_id: Number(parsed.venue_id),
          match_format: {
            min_age:
              parsed.match_format.min_age !== undefined &&
                parsed.match_format.min_age !== null
                ? Number(parsed.match_format.min_age)
                : undefined,
            max_age:
              parsed.match_format.max_age !== undefined &&
                parsed.match_format.max_age !== null
                ? Number(parsed.match_format.max_age)
                : undefined,
            eligible_gender: parsed.match_format.eligible_gender,
            metadata: metadata,
          },
          start_time: new Date(parsed.start_time).toISOString(),
          end_time: new Date(parsed.end_time).toISOString(),
          capacity: Number(parsed.capacity),
          registration_fee: Number(parsed.registration_fee) || 0,
          image_url: parsed.image_url || undefined,
          // Store tournament format in metadata
          metadata: {
            format: value.tournament_format || 'swiss',
          },
        };

        // Store the submit data and show confirmation dialog
        setPendingSubmitData(submitData);
        setShowConfirmDialog(true);
      } catch (error) {
        if (error instanceof z.ZodError) {
          toast.error("Please fix the form errors before submitting");
          console.error("Validation errors:", error.errors);
        } else {
          toast.error("An error occurred while submitting the form");
          console.error("Submit error:", error);
        }
      }
    },
  });

  return (
    <ScrollablePage className="bg-background">
      <ScrollablePageHeader className="pb-0 bg-transparent">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 supports-backdrop-filter:bg-background/60">
          <div className="flex items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-lg font-black uppercase tracking-tight">New Tournament</h1>
            <div className="size-10" />
          </div>
        </header>
      </ScrollablePageHeader>

      <ScrollablePageContent className="pb-24">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 inset-x-0 h-48 bg-linear-to-b from-brand-blue/10 to-transparent skew-y-3 origin-top-left scale-110 pointer-events-none -z-10" />
        <div className="absolute top-0 right-0 size-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none -z-10" />

        <div className="p-4 space-y-6">
          {/* Hero Section */}
          <div className="text-center pt-4 pb-2">
            <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10 mb-4">
              <Trophy className="size-8 text-primary" />
            </div>
            <h2 className="text-2xl font-black italic tracking-tight uppercase">Create Tournament</h2>
            <p className="text-muted-foreground text-sm mt-1">Set up your competition details</p>
          </div>

          <Card className="border-border/50 bg-background/80 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden">
            <CardContent className="p-5">
              <form
                id="create-tournament-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
              >
                <FieldGroup>
                  {/* Basic Info Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Basic Info</h3>
                    </div>

                    {/* Name */}
                    <form.Field
                      name="name"
                      children={(field) => {
                        const isInvalid =
                          field.state.meta.isTouched && !field.state.meta.isValid;
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Tournament Name *
                            </FieldLabel>
                            <Input
                              id={field.name}
                              name={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) => field.handleChange(e.target.value)}
                              aria-invalid={isInvalid}
                              placeholder="Enter tournament name"
                              className="h-11 rounded-xl bg-muted/40 border-transparent focus:bg-background focus:border-input"
                            />
                            {isInvalid && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        );
                      }}
                    />

                    {/* Description */}
                    <form.Field
                      name="description"
                      children={(field) => {
                        const isInvalid =
                          field.state.meta.isTouched && !field.state.meta.isValid;
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Description *
                            </FieldLabel>
                            <textarea
                              id={field.name}
                              name={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) => field.handleChange(e.target.value)}
                              aria-invalid={isInvalid}
                              placeholder="Enter tournament description"
                              rows={4}
                              className="w-full min-h-[100px] rounded-xl border border-transparent bg-muted/40 px-4 py-3 text-sm transition-all outline-none focus:bg-background focus:border-input focus:ring-2 focus:ring-primary/20"
                            />
                            {isInvalid && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        );
                      }}
                    />
                  </div>

                  {/* Game Section */}
                  <div className="space-y-4 pt-6 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Trophy className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Game</h3>
                    </div>

                    <form.Field
                      name="game_id"
                      children={(field) => {
                        const isInvalid =
                          field.state.meta.isTouched && !field.state.meta.isValid;
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Game *</FieldLabel>
                            <Select
                              value={field.state.value || ""}
                              onValueChange={(value) => {
                                field.handleChange(value);
                                field.handleBlur();
                              }}
                              disabled={gamesLoading}
                            >
                              <SelectTrigger
                                id={field.name}
                                aria-invalid={isInvalid}
                                className="w-full h-11 rounded-xl border border-transparent bg-muted/40 px-4 py-2 text-sm transition-all outline-none focus:bg-background focus:border-input focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                              >
                                <SelectValue placeholder="Select a game" />
                              </SelectTrigger>
                              <SelectContent>
                                {games.map((game) => (
                                  <SelectItem key={game.id} value={String(game.id)}>
                                    {game.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isInvalid && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        );
                      }}
                    />
                  </div>

                  {/* Tournament Format Section */}
                  <div className="space-y-4 pt-6 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Layers className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Tournament Format</h3>
                    </div>

                    <form.Field
                      name="tournament_format"
                      children={(field) => {
                        return (
                          <Field>
                            <div className="grid grid-cols-1 gap-3">
                              {TOURNAMENT_FORMATS.map((format) => (
                                <label
                                  key={format.value}
                                  className={`relative flex cursor-pointer rounded-xl border-2 p-4 transition-all ${field.state.value === format.value
                                    ? 'border-primary bg-primary/5 shadow-sm'
                                    : 'border-border/50 hover:bg-muted/30 hover:border-border'
                                    }`}
                                >
                                  <input
                                    type="radio"
                                    name={field.name}
                                    value={format.value}
                                    checked={field.state.value === format.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    className="sr-only"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                      <div className={`size-5 rounded-full border-2 flex items-center justify-center transition-colors ${field.state.value === format.value
                                        ? 'border-primary bg-primary'
                                        : 'border-muted-foreground/30'
                                        }`}>
                                        {field.state.value === format.value && (
                                          <div className="size-2 rounded-full bg-white" />
                                        )}
                                      </div>
                                      <span className="font-bold text-sm">
                                        {format.label}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground ml-8">
                                      {format.description}
                                    </p>
                                  </div>
                                </label>
                              ))}
                            </div>
                            <FieldDescription className="mt-3 text-xs bg-muted/30 p-3 rounded-lg">
                              {field.state.value === 'swiss'
                                ? '💡 Swiss system pairs players dynamically each round. Best for individual skill-based tournaments.'
                                : '💡 Group + Knockout requires pre-formed teams. Teams compete in groups, then advance to knockout rounds.'
                              }
                            </FieldDescription>
                          </Field>
                        );
                      }}
                    />
                  </div>

                  {/* Venue Section */}
                  <div className="space-y-4 pt-6 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <MapPin className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Location</h3>
                    </div>

                    <form.Field
                      name="venue_id"
                      children={(field) => {
                        const isInvalid =
                          field.state.meta.isTouched && !field.state.meta.isValid;
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Venue *</FieldLabel>
                            <select
                              id={field.name}
                              name={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) => field.handleChange(e.target.value)}
                              aria-invalid={isInvalid}
                              disabled={venuesLoading}
                              className="w-full h-11 rounded-xl border border-transparent bg-muted/40 px-4 py-2 text-sm transition-all outline-none focus:bg-background focus:border-input focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                            >
                              <option value="">Select a venue</option>
                              {venues.map((venue) => (
                                <option key={venue.id} value={venue.id}>
                                  {venue.name} - {venue.address}
                                </option>
                              ))}
                            </select>
                            {isInvalid && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        );
                      }}
                    />
                  </div>

                  {/* Match Format Section */}
                  <div className="space-y-4 pt-6 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Users className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Match Format</h3>
                    </div>

                    {/* Eligible Gender */}
                    <form.Field
                      name="match_format.eligible_gender"
                      children={(field) => {
                        const isInvalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid;
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Eligible Gender *
                            </FieldLabel>
                            <select
                              id={field.name}
                              name={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              aria-invalid={isInvalid}
                              className="w-full h-11 rounded-xl border border-transparent bg-muted/40 px-4 py-2 text-sm transition-all outline-none focus:bg-background focus:border-input focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="MW">
                                Mixed (M & W) - Auto: Mixed Doubles
                              </option>
                              <option value="M">
                                Male Only - Auto: Men's Doubles
                              </option>
                              <option value="W">
                                Female Only - Auto: Women's Doubles
                              </option>
                            </select>
                            <FieldDescription className="text-xs mt-2">
                              Match type will be automatically generated based
                              on your selection
                            </FieldDescription>
                            {isInvalid && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        );
                      }}
                    />

                  </div>

                  {/* Schedule Section */}
                  <div className="space-y-4 pt-6 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Schedule</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Start Time */}
                      <form.Field
                        name="start_time"
                        children={(field) => {
                          const isInvalid =
                            field.state.meta.isTouched && !field.state.meta.isValid;
                          return (
                            <Field data-invalid={isInvalid}>
                              <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Start Time *
                              </FieldLabel>
                              <Input
                                id={field.name}
                                name={field.name}
                                type="datetime-local"
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                aria-invalid={isInvalid}
                                className="h-11 rounded-xl bg-muted/40 border-transparent focus:bg-background focus:border-input"
                              />
                              {isInvalid && (
                                <FieldError errors={field.state.meta.errors} />
                              )}
                            </Field>
                          );
                        }}
                      />

                      {/* End Time */}
                      <form.Field
                        name="end_time"
                        children={(field) => {
                          const isInvalid =
                            field.state.meta.isTouched && !field.state.meta.isValid;
                          return (
                            <Field data-invalid={isInvalid}>
                              <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                End Time *
                              </FieldLabel>
                              <Input
                                id={field.name}
                                name={field.name}
                                type="datetime-local"
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                aria-invalid={isInvalid}
                                className="h-11 rounded-xl bg-muted/40 border-transparent focus:bg-background focus:border-input"
                              />
                              {isInvalid && (
                                <FieldError errors={field.state.meta.errors} />
                              )}
                            </Field>
                          );
                        }}
                      />
                    </div>
                  </div>

                  {/* Capacity & Fee Section */}
                  <div className="space-y-4 pt-6 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <DollarSign className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Capacity & Fees</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Capacity */}
                      <form.Field
                        name="capacity"
                        children={(field) => {
                          const isInvalid =
                            field.state.meta.isTouched && !field.state.meta.isValid;
                          return (
                            <Field data-invalid={isInvalid}>
                              <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Max Players *
                              </FieldLabel>
                              <Input
                                id={field.name}
                                name={field.name}
                                type="number"
                                min="1"
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                aria-invalid={isInvalid}
                                placeholder="16"
                                className="h-11 rounded-xl bg-muted/40 border-transparent focus:bg-background focus:border-input"
                              />
                              {isInvalid && (
                                <FieldError errors={field.state.meta.errors} />
                              )}
                            </Field>
                          );
                        }}
                      />

                      {/* Registration Fee */}
                      <form.Field
                        name="registration_fee"
                        children={(field) => {
                          const isInvalid =
                            field.state.meta.isTouched && !field.state.meta.isValid;
                          return (
                            <Field data-invalid={isInvalid}>
                              <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Entry Fee (₹)
                              </FieldLabel>
                              <Input
                                id={field.name}
                                name={field.name}
                                type="number"
                                min="0"
                                step="0.01"
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                aria-invalid={isInvalid}
                                placeholder="0 (Free)"
                                className="h-11 rounded-xl bg-muted/40 border-transparent focus:bg-background focus:border-input"
                              />
                              {isInvalid && (
                                <FieldError errors={field.state.meta.errors} />
                              )}
                            </Field>
                          );
                        }}
                      />
                    </div>
                  </div>

                  {/* Image URL Section */}
                  <div className="space-y-4 pt-6 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Image className="size-4 text-primary" />
                      </div>
                      <h3 className="font-black text-sm uppercase tracking-wider text-foreground">Cover Image</h3>
                    </div>

                    <form.Field
                      name="image_url"
                      children={(field) => {
                        const isInvalid =
                          field.state.meta.isTouched && !field.state.meta.isValid;
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Image URL (Optional)
                            </FieldLabel>
                            <Input
                              id={field.name}
                              name={field.name}
                              type="url"
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) => field.handleChange(e.target.value)}
                              aria-invalid={isInvalid}
                              placeholder="https://example.com/image.jpg"
                              className="h-11 rounded-xl bg-muted/40 border-transparent focus:bg-background focus:border-input"
                            />
                            <FieldDescription className="text-xs">
                              Add a cover image URL for your tournament
                            </FieldDescription>
                            {isInvalid && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        );
                      }}
                    />
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="fixed bottom-0 left-0 right-0 p-4 z-50 pointer-events-none ">
            <div className="max-w-[500px] mx-auto w-full space-y-2 border-r border-l pt-8 pointer-events-auto bg-linear-to-t from-background via-background to-transparent">
              <div className="flex items-center justify-center gap-3 p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.reset()}
                  className="size-12"
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  type="submit"
                  form="create-tournament-form"
                  className="flex-1 h-14 rounded-xl shadow-xl shadow-primary/25 text-lg font-black uppercase tracking-wide"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending
                    ? "Creating..."
                    : "Create Tournament"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollablePageContent>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Tournament Creation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to create the tournament "{pendingSubmitData?.name}"?
              This action cannot be undone. Please review all details before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPendingSubmitData(null);
              setShowConfirmDialog(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSubmitData) {
                  createMutation.mutate(pendingSubmitData);
                  setShowConfirmDialog(false);
                  setPendingSubmitData(null);
                }
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Tournament"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollablePage>
  );
}
