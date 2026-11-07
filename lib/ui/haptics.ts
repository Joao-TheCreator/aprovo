/**
 * Haptic-like feedback (docs/14, "Feedback háptico"). Uses the Vibration API where it exists
 * (Android Chrome); elsewhere it is a no-op and the visual cue (press scale, pulse) carries the
 * feedback. Never vibrates when the user asked for reduced motion.
 */
export type HapticPattern = "tap" | "success" | "warning" | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  success: [12, 40, 18],
  warning: [20, 60, 20],
  error: [30, 50, 30, 50, 30],
};

export function haptic(pattern: HapticPattern = "tap"): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw when called without a user gesture; feedback is optional.
  }
}
