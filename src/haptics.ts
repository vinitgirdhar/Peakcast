// Small taps of vibration for touch feedback. In the Android app they use the
// phone's own haptic engine (android/MainActivity.java, which respects the
// user's system haptics setting); elsewhere navigator.vibrate where supported.
// Nothing happens on desktop or when the user prefers reduced motion.

export type Haptic =
  /** A light tick: tab switch, toggle, chip, selection. */
  | "selection"
  /** A firmer tap: primary button, opening a sheet. */
  | "impact"
  /** Something succeeded: trade filled, draft saved, bonus claimed. */
  | "success"
  /** Something was refused: validation error, failed action. */
  | "warning";

interface AndroidBridge {
  haptic?: (kind: string) => void;
}

const patterns: Record<Haptic, number | number[]> = {
  selection: 8,
  impact: 14,
  success: [12, 60, 18],
  warning: [24, 50, 24],
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function haptic(kind: Haptic = "selection") {
  if (reduced()) return;
  const android = (window as unknown as { PeakcastAndroid?: AndroidBridge })
    .PeakcastAndroid;
  try {
    if (android?.haptic) android.haptic(kind);
    else if (matchMedia("(pointer: coarse)").matches)
      navigator.vibrate?.(patterns[kind]);
  } catch {
    // Haptics are a nicety; never let them break the action they decorate.
  }
}
