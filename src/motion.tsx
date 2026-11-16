import { useEffect, type ReactNode } from "react";
import {
  AnimatePresence,
  animate,
  motion,
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
