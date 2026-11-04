import { useState, useEffect } from "react";

/**
 * Calculate dynamic greeting based on the user's local device time.
 * Rules:
 * - 05:00–11:59: Good morning
 * - 12:00–16:59: Good afternoon
 * - 17:00–04:59: Good evening (including midnight)
 *
 * @param date Optional date to evaluate (defaults to current device time)
 */
export function getGreeting(date: Date = new Date()): string {
  const hours = date.getHours();
  if (hours >= 5 && hours < 12) {
    return "Good morning";
  }
  if (hours >= 12 && hours < 17) {
    return "Good afternoon";
  }
  return "Good evening";
}

/**
 * React hook that returns the dynamic greeting and automatically updates it
 * as time changes across boundary thresholds without requiring a page refresh.
 * Automatically cleans up its interval timer on unmount.
 */
export function useGreeting(): string {
  const [greeting, setGreeting] = useState<string>(() => getGreeting());

  useEffect(() => {
    // Check every 10 seconds to detect boundary crossing promptly
    const interval = setInterval(() => {
      const current = getGreeting();
      setGreeting(prev => (prev !== current ? current : prev));
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return greeting;
}

