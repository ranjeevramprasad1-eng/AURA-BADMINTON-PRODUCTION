'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for managing display timer with phase cycling
 * @param {Object} config - Timer configuration
 * @param {number} config.scoreDuration - Duration for score phase in ms
 * @param {number} config.groupDuration - Duration per group in ms
 * @param {number} config.standingsDuration - Fallback duration for standings in ms
 * @param {number} config.groupCount - Number of groups to cycle through
 * @returns {Object} Timer state and controls
 */
export function useDisplayTimer({
  scoreDuration = 30000,
  groupDuration = 10000,
  standingsDuration = 10000,
  groupCount = 0,
  initialStopped = false,
}) {
  const [showStandings, setShowStandings] = useState(false);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopped, setIsStopped] = useState(initialStopped);
  
  // Refs to store interval IDs
  const progressIntervalRef = useRef(null);
  const groupIntervalRef = useRef(null);
  const savedProgressRef = useRef(0);

  // Calculate total standings duration based on number of groups
  const totalStandingsDuration = groupCount > 0 
    ? groupCount * groupDuration 
    : standingsDuration;

  // Get current group key (0-indexed)
  const currentGroupIndexValue = showStandings && groupCount > 0
    ? currentGroupIndex % groupCount
    : null;

  // Calculate progress percentage
  const getProgressPercentage = () => {
    if (showStandings) {
      return (progress / totalStandingsDuration) * 100;
    }
    return (progress / scoreDuration) * 100;
  };

  // Clear intervals helper
  const clearAllIntervals = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (groupIntervalRef.current) {
      clearInterval(groupIntervalRef.current);
      groupIntervalRef.current = null;
    }
  }, []);

  // Timer effect for cycling through groups
  useEffect(() => {
    if (!showStandings || groupCount === 0 || isPaused || isStopped) {
      if (groupIntervalRef.current) {
        clearInterval(groupIntervalRef.current);
        groupIntervalRef.current = null;
      }
      return;
    }

    groupIntervalRef.current = setInterval(() => {
      setCurrentGroupIndex((prev) => (prev + 1) % groupCount);
    }, groupDuration);

    return () => {
      if (groupIntervalRef.current) {
        clearInterval(groupIntervalRef.current);
        groupIntervalRef.current = null;
      }
    };
  }, [showStandings, groupCount, groupDuration, isPaused, isStopped]);

  // Reset group index when standings become visible
  useEffect(() => {
    if (showStandings) {
      setCurrentGroupIndex(0);
    }
  }, [showStandings]);

  // Main timer effect for phase cycling
  useEffect(() => {
    if (isStopped || isPaused) {
      clearAllIntervals();
      return;
    }

    const startScorePhase = () => {
      setShowStandings(false);
      const startProgress = savedProgressRef.current || 0;
      setProgress(startProgress);
      savedProgressRef.current = 0;

      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev + 100;
          if (newProgress >= scoreDuration) {
            clearAllIntervals();
            startStandingsPhase();
            return scoreDuration;
          }
          return newProgress;
        });
      }, 100);
    };

    const startStandingsPhase = () => {
      setShowStandings(true);
      const startProgress = savedProgressRef.current || 0;
      setProgress(startProgress);
      savedProgressRef.current = 0;

      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev + 100;
          if (newProgress >= totalStandingsDuration) {
            clearAllIntervals();
            startScorePhase();
            return totalStandingsDuration;
          }
          return newProgress;
        });
      }, 100);
    };

    // Start the appropriate phase
    if (showStandings) {
      startStandingsPhase();
    } else {
      startScorePhase();
    }

    return () => {
      clearAllIntervals();
    };
  }, [scoreDuration, totalStandingsDuration, isPaused, isStopped, clearAllIntervals, showStandings]);

  // Control functions
  const pause = useCallback(() => {
    setIsPaused(true);
    savedProgressRef.current = progress;
    clearAllIntervals();
  }, [progress, clearAllIntervals]);

  const resume = useCallback(() => {
    setIsPaused(false);
    setIsStopped(false);
  }, []);

  const stop = useCallback(() => {
    setIsStopped(true);
    setIsPaused(false);
    savedProgressRef.current = 0;
    setProgress(0);
    setCurrentGroupIndex(0);
    clearAllIntervals();
  }, [clearAllIntervals]);

  const reset = useCallback(() => {
    setIsStopped(false);
    setIsPaused(false);
    savedProgressRef.current = 0;
    setProgress(0);
    setCurrentGroupIndex(0);
    clearAllIntervals();
  }, [clearAllIntervals]);

  return {
    showStandings,
    currentGroupIndex: currentGroupIndexValue,
    progress,
    progressPercentage: getProgressPercentage(),
    isPaused,
    isStopped,
    pause,
    resume,
    stop,
    reset,
  };
}
