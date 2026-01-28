'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Pause, Square } from 'lucide-react';

/**
 * ViewCourtHeader Component
 * Header for the fullscreen court view
 */
export function ViewCourtHeader({ 
  tournamentName, 
  courtNumber, 
  status, 
  statusText, 
  round, 
  onBack,
  progressPercentage,
  isPaused,
  isStopped,
  onPause,
  onResume,
  onStop,
  onReset,
}) {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 pointer-events-auto pt-safe-top">
      {/* Progress Timer Bar */}
      <div className="w-full h-1 bg-muted/30">
        <div
          className="h-full bg-primary transition-all duration-100 ease-linear"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between px-4 py-3 bg-linear-to-b from-background/95 via-background/90 to-transparent backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-full bg-background/80 backdrop-blur-md text-foreground hover:bg-background hover:text-foreground border border-border/50"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            {tournamentName && (
              <h2 className="text-xl font-black italic tracking-tighter text-foreground">
                {tournamentName}
              </h2>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              Court {courtNumber}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Timer Controls */}
          {/* <TimerControls
            isPaused={isPaused}
            isStopped={isStopped}
            onPause={onPause}
            onResume={onResume}
            onStop={onStop}
            onReset={onReset}
          /> */}
          
          <div className="text-right">
            <StatusBadge status={status} statusText={statusText} />
            {round && (
              <p className="text-xs text-muted-foreground mt-1.5">Round {round}</p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function TimerControls({ isPaused, isStopped, onPause, onResume, onStop, onReset }) {
  return (
    <div className="flex items-center gap-2">
      {isStopped ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          className="rounded-full bg-background/80 backdrop-blur-md text-foreground hover:bg-background hover:text-foreground border border-border/50"
          title="Start Timer"
        >
          <Play className="size-4" />
        </Button>
      ) : isPaused ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onResume}
            className="rounded-full bg-background/80 backdrop-blur-md text-foreground hover:bg-background hover:text-foreground border border-border/50"
            title="Resume"
          >
            <Play className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            className="rounded-full bg-background/80 backdrop-blur-md text-foreground hover:bg-background hover:text-foreground border border-border/50"
            title="Stop"
          >
            <Square className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onPause}
            className="rounded-full bg-background/80 backdrop-blur-md text-foreground hover:bg-background hover:text-foreground border border-border/50"
            title="Pause"
          >
            <Pause className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            className="rounded-full bg-background/80 backdrop-blur-md text-foreground hover:bg-background hover:text-foreground border border-border/50"
            title="Stop"
          >
            <Square className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, statusText }) {
  const badgeClass = status === 'in_progress'
    ? 'bg-red-500 text-white animate-pulse'
    : status === 'completed'
      ? 'bg-green-500 text-white'
      : 'bg-muted text-muted-foreground';

  return (
    <div className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${badgeClass}`}>
      {statusText}
    </div>
  );
}
