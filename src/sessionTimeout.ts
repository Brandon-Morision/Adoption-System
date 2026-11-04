import { useEffect, useRef } from "react";
import { api, notifySessionExpired } from "./api";

export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const STORAGE_LAST_ACTIVITY_KEY = "AODS_LAST_ACTIVITY";
export const STORAGE_SESSION_STATE_KEY = "AODS_SESSION_STATE";
export const STORAGE_EXPIRED_MSG_KEY = "AODS_EXPIRED_MSG";

const THROTTLE_LOCAL_MS = 2000; // Update localStorage at most once every 2 seconds
const THROTTLE_SERVER_TOUCH_MS = 30000; // Touch backend at most once every 30 seconds

/**
 * Record user activity in localStorage and optionally notify server.
 */
export function recordUserActivity(touchServer = false): void {
  const now = Date.now();
  try {
    localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, now.toString());
    localStorage.setItem(STORAGE_SESSION_STATE_KEY, "active");
  } catch {
    // localStorage unavailable
  }

  if (touchServer) {
    api.touchSession().catch(() => {});
  }
}

/**
 * Check if the stored session activity has exceeded the 15-minute inactivity threshold.
 */
export function isSessionInactive(maxIdleMs: number = INACTIVITY_TIMEOUT_MS): boolean {
  try {
    const state = localStorage.getItem(STORAGE_SESSION_STATE_KEY);
    if (state === "expired" || state === "logged_out") return true;

    const lastStr = localStorage.getItem(STORAGE_LAST_ACTIVITY_KEY);
    if (!lastStr) return false;

    const last = parseInt(lastStr, 10);
    if (isNaN(last) || last <= 0) return false;

    return Date.now() - last >= maxIdleMs;
  } catch {
    return false;
  }
}

/**
 * Set session state to expired across all tabs and notify the application.
 */
export function triggerSessionTimeout(
  message = "Your session expired due to inactivity. Please log in again."
): void {
  try {
    localStorage.setItem(STORAGE_SESSION_STATE_KEY, "expired");
    localStorage.setItem(STORAGE_EXPIRED_MSG_KEY, message);
    // Overwrite with an old timestamp
    localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, (Date.now() - INACTIVITY_TIMEOUT_MS - 1000).toString());
  } catch {}

  // Invalidate on server
  api.logout().catch(() => {});

  // Notify active listeners
  notifySessionExpired(message);
}

/**
 * React hook that manages:
 * 1. Global event listeners for genuine user interactions (mouse, keyboard, scroll, touch).
 * 2. Throttled activity recording to localStorage and backend /api/auth/touch.
 * 3. 15-minute inactivity countdown loop with zero competing duplicate timers.
 * 4. Cross-tab synchronization via the 'storage' event.
 * 5. Automatic cleanup on logout or component unmount.
 */
export function useSessionTimeout({
  enabled,
  onExpired
}: {
  enabled: boolean;
  onExpired: (message: string) => void;
}) {
  const lastLocalRef = useRef<number>(Date.now());
  const lastTouchRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    // 1. Initialize activity timestamp on enable
    const now = Date.now();
    lastLocalRef.current = now;
    try {
      const existing = localStorage.getItem(STORAGE_LAST_ACTIVITY_KEY);
      if (!existing || isSessionInactive()) {
        localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, now.toString());
      }
      localStorage.setItem(STORAGE_SESSION_STATE_KEY, "active");
      localStorage.removeItem(STORAGE_EXPIRED_MSG_KEY);
    } catch {}

    // 2. Activity event handler
    const handleGenuineActivity = () => {
      const currentTime = Date.now();

      // Throttle localStorage updates to once every 2 seconds
      if (currentTime - lastLocalRef.current >= THROTTLE_LOCAL_MS) {
        lastLocalRef.current = currentTime;
        try {
          localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, currentTime.toString());
          localStorage.setItem(STORAGE_SESSION_STATE_KEY, "active");
        } catch {}
      }

      // Throttle backend server touch to once every 30 seconds
      if (currentTime - lastTouchRef.current >= THROTTLE_SERVER_TOUCH_MS) {
        lastTouchRef.current = currentTime;
        api.touchSession().catch(() => {});
      }
    };

    // Listen to all genuine user interaction events
    const eventOptions: AddEventListenerOptions = { passive: true, capture: true };
    const interactionEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "touchmove",
      "pointerdown",
      "wheel"
    ];

    interactionEvents.forEach(evt => {
      window.addEventListener(evt, handleGenuineActivity, eventOptions);
    });

    // 3. Cross-tab synchronization via window 'storage' event
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_SESSION_STATE_KEY) {
        if (e.newValue === "expired") {
          const msg = localStorage.getItem(STORAGE_EXPIRED_MSG_KEY) || "Your session expired due to inactivity. Please log in again.";
          onExpired(msg);
        } else if (e.newValue === "logged_out") {
          onExpired("");
        }
      } else if (e.key === STORAGE_LAST_ACTIVITY_KEY && e.newValue) {
        const remoteTime = parseInt(e.newValue, 10);
        if (!isNaN(remoteTime) && remoteTime > lastLocalRef.current) {
          lastLocalRef.current = remoteTime;
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // 4. Single Interval Timer checking for inactivity expiration
    const intervalId = setInterval(() => {
      let lastActivity = lastLocalRef.current;
      try {
        const stored = localStorage.getItem(STORAGE_LAST_ACTIVITY_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed) && parsed > 0) {
            lastActivity = Math.max(lastActivity, parsed);
          }
        }
      } catch {}

      const idleDuration = Date.now() - lastActivity;
      if (idleDuration >= INACTIVITY_TIMEOUT_MS) {
        clearInterval(intervalId);
        triggerSessionTimeout();
        onExpired("Your session expired due to inactivity. Please log in again.");
      }
    }, 1000);

    // 5. Cleanup on unmount or when disabled
    return () => {
      interactionEvents.forEach(evt => {
        window.removeEventListener(evt, handleGenuineActivity, eventOptions);
      });
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(intervalId);
    };
  }, [enabled, onExpired]);
}

