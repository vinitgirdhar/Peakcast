import { useEffect, useRef, type ReactNode } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from "motion/react";

/** Same curve as --spring in styles.css: a quick ease-out with no overshoot. */
export const ease = [0.2, 0.8, 0.2, 1] as const;

export const listMotion: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
export const itemMotion: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease } },
};
export const enterMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease },
} as const;

/** Tweens between values without re-rendering React; jumps when motion is reduced. */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (value: number) => string;
}) {
  const reduce = useReducedMotion();
  const current = useMotionValue(value);
  const text = useTransform(current, format);
  useEffect(() => {
    if (reduce) {
      current.set(value);
      return;
    }
    const controls = animate(current, value, { duration: 0.25, ease });
    return () => controls.stop();
  }, [current, reduce, value]);
  return <motion.span>{text}</motion.span>;
}

/** A small spring "bump" each time `value` changes (not on mount): for counters and badges. */
export function Bump({
  value,
  className,
  children,
}: {
  value: unknown;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [scope, run] = useAnimate<HTMLSpanElement>();
  const previous = useRef(value);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    if (reduce || !scope.current) return;
    const controls = run(
      scope.current,
      { scale: [1, 1.07, 1] },
      { duration: 0.36, ease },
    );
    return () => controls.stop();
  }, [reduce, run, scope, value]);
  return (
    <span ref={scope} className={className} style={{ display: "inline-flex" }}>
      {children}
    </span>
  );
}

/** Height and fade for disclosure content; overflow is released once open so menus and focus rings are not clipped. */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          id={id}
          className={className}
          initial={{ height: 0, opacity: 0, overflow: "hidden" }}
          animate={{
            height: "auto",
            opacity: 1,
            transitionEnd: { overflow: "visible" },
          }}
          exit={{ height: 0, opacity: 0, overflow: "hidden" }}
          transition={{ duration: reduce ? 0 : 0.2, ease }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A row that leaves by fading out of flow while its neighbours glide into place (inside AnimatePresence popLayout). */
export const rowExit = {
  opacity: 0,
  x: -12,
  transition: { duration: 0.16, ease },
};

/**
 * Entrance for a row inside AnimatePresence, where list variants do not
 * propagate: staggered by index, played once when the row mounts (so a data
 * refresh that keeps the row does not replay it). The timing lives in the
 * target, so hover, tap and layout animations stay undelayed.
 */
export const rowEnter = (index: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease, delay: Math.min(index, 12) * 0.035 },
  },
});
