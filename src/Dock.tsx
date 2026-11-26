import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type Variants,
} from "motion/react";
import { ChevronRight, FilePen, Files, Plus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PeakcastClient } from "../shared/client.js";
import { haptic } from "./haptics.js";
import { ease } from "./motion.js";

export interface DockItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface CreateAction {
  path: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  count?: number;
}

const spring = { type: "spring", stiffness: 520, damping: 40 } as const;
const sheetSpring = { type: "spring", stiffness: 460, damping: 32 } as const;
const actionsMotion: Variants = {
  closed: {},
  open: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
const actionMotion: Variants = {
  closed: { opacity: 0, y: 8 },
  open: { opacity: 1, y: 0, transition: { duration: 0.2, ease } },
};

/** Phone tab bar: four tabs around a raised + that opens the create sheet. */
export function MobileDock({
  items,
  section,
  teams,
  client,
  onNavigate,
}: {
  /** Exactly four tabs; the + sits between the second and third. */
  items: DockItem[];
  /** Label of the current section, to mark the selected tab. */
  section: string;
  teams: boolean;
  client: PeakcastClient;
  onNavigate: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<number>();
  // Where to go once the sheet's history entry is gone (see choose()).
  const pending = useRef<string | null>(null);
  const fab = useRef<HTMLButtonElement>(null);

  // The sheet owns a history entry, so Android back (and browser back) closes it.
  useEffect(() => {
    const onPop = () => {
      setOpen(false);
      const next = pending.current;
      pending.current = null;
      if (next) onNavigate(next);
      else if (document.activeElement?.closest(".create-sheet"))
        fab.current?.focus({ preventScroll: true });
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [onNavigate]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    client
      .drafts()
      .then((result) => active && setDrafts(result.items.length))
      .catch(() => undefined); // The count is optional; the sheet works without it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    return () => {
      active = false;
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  function show() {
    haptic("impact");
    history.pushState({ createSheet: true }, "");
    setOpen(true);
  }
  function close() {
    if (history.state?.createSheet) history.back();
    else setOpen(false);
  }
  /** Leaves through the sheet's history entry, so back never lands on a dead step. */
  function choose(path: string) {
    if (history.state?.createSheet) {
      pending.current = path;
      history.back();
    } else {
      setOpen(false);
      onNavigate(path);
    }
  }

  const actions: CreateAction[] = [
    {
      path: "/studio",
      label: "New draft",
      hint: "Write a question and its rules",
      icon: FilePen,
    },
    {
      path: "/studio/drafts",
      label: "Saved drafts",
      hint: "Review, edit or launch",
      icon: Files,
      count: drafts,
    },
    ...(teams
      ? [
          {
            path: "/teams",
            label: "Teams",
            hint: "Private workspaces",
            icon: Users,
          },
        ]
      : []),
  ];

  function go(path: string) {
    if (open) choose(path);
    else onNavigate(path);
  }

  const glass = useDockGlass(items, section, go);

  const tab = ({ path, label, icon: Icon }: DockItem, index: number) => (
    <button
      key={path}
      ref={(node) => {
        glass.tabs.current[index] = node;
      }}
      onClick={() => {
        if (section !== label) haptic("selection");
        go(path);
      }}
      aria-current={section === label ? "page" : undefined}
      className={section === label ? "selected" : ""}
      data-under={glass.under === index || undefined}
    >
      <Icon size={21} />
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            className="dock-scrim"
            aria-hidden="true"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease }}
          />
        )}
        {open && (
          <motion.div
            key="sheet"
            id="create-sheet"
            className="create-sheet"
            role="dialog"
            aria-label="Create"
            initial={{ opacity: 0, scale: 0.4, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            // A short tween out: a spring's long tail would keep the sheet catching taps.
            exit={{
              opacity: 0,
              scale: 0.7,
              y: 24,
              transition: { duration: 0.16, ease },
            }}
            transition={sheetSpring}
          >
            <motion.div
              className="create-actions"
              variants={actionsMotion}
              initial="closed"
              animate="open"
            >
              {actions.map(({ path, label, hint, icon: Icon, count }) => (
                <motion.button
                  key={path}
                  variants={actionMotion}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    haptic("selection");
                    choose(path);
                  }}
                  // ponytail: first action takes focus so keyboard users land in the sheet.
                  autoFocus={path === "/studio"}
                >
                  <span className="create-icon">
                    <Icon size={20} />
                  </span>
                  <span className="create-copy">
                    <strong>
                      {label}
                      {count !== undefined && (
                        <span className="count-pill">{count}</span>
                      )}
                    </strong>
                    <small>{hint}</small>
                  </span>
                  <ChevronRight size={18} className="create-chevron" />
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <nav
        ref={glass.nav}
        className="mobile-dock"
        aria-label="Quick navigation"
        data-dragging={glass.under !== null || undefined}
        {...glass.handlers}
      >
        {/* One glass pill for the whole dock: it glides to the current tab and follows a drag. */}
        <motion.span
          className="dock-selection"
          aria-hidden="true"
          style={glass.style}
          animate={{ opacity: glass.visible ? 1 : 0 }}
          transition={{ duration: 0.15, ease }}
        />
        {items.slice(0, 2).map((item, index) => tab(item, index))}
        <div className="dock-fab-slot">
          <motion.button
            ref={fab}
            className={`dock-fab ${open ? "open" : ""}`}
            aria-label={open ? "Close create menu" : "Create"}
            aria-expanded={open}
            aria-controls="create-sheet"
            aria-haspopup="dialog"
            whileTap={{ scale: 0.9 }}
            transition={spring}
            onClick={() => (open ? close() : show())}
          >
            <motion.span
              className="dock-fab-icon"
              animate={{ rotate: open ? 45 : 0 }}
              transition={spring}
            >
              <Plus size={26} strokeWidth={2.4} />
            </motion.span>
          </motion.button>
        </div>
        {items.slice(2).map((item, index) => tab(item, index + 2))}
      </nav>
    </>
  );
}

interface Slot {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Gesture {
  id: number;
  startX: number;
  startY: number;
  active: boolean;
  /** Dock's left edge and tab boxes, read once when the drag starts. */
  origin: number;
  slots: Slot[];
}

const nearest = (slots: Slot[], left: number) =>
  slots.reduce(
    (best, slot, index) =>
      Math.abs(slot.left - left) < Math.abs(slots[best].left - left)
        ? index
        : best,
    0,
  );

/**
 * Liquid-glass selection: glides to the current tab, and a horizontal drag
 * anywhere on the dock (but the +) pulls it under the finger, stretching with
 * speed; release snaps to the nearest tab and opens it. Taps stay plain clicks.
 */
function useDockGlass(
  items: DockItem[],
  section: string,
  go: (path: string) => void,
) {
  const reduce = useReducedMotion();
  const nav = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const gesture = useRef<Gesture | null>(null);
  const dragged = useRef(false);
  const shown = useRef(false);
  // Index of the tab under the glass while dragging; null when not dragging.
  const [under, setUnder] = useState<number | null>(null);
  const underRef = useRef<number | null>(null);
  const selected = items.findIndex((item) => item.label === section);
  const visible = selected >= 0 || under !== null;

  const target = useMotionValue(0);
  // Near-critical spring: glides and settles without a visible bounce.
  const x = useSpring(target, { stiffness: 520, damping: 40 });
  const top = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const velocity = useVelocity(x);
  // Stretches along the direction of travel and thins, like a drop of glass.
  const scaleX = useTransform(velocity, [-2400, 0, 2400], [1.2, 1, 1.2]);
  const scaleY = useTransform(velocity, [-2400, 0, 2400], [0.88, 1, 0.88]);

  const measure = (): Slot[] =>
    tabs.current.map((node) => ({
      left: node?.offsetLeft ?? 0,
      top: node?.offsetTop ?? 0,
      width: node?.offsetWidth ?? 0,
      height: node?.offsetHeight ?? 0,
    }));
  function place(slot: Slot, instant: boolean) {
    top.set(slot.top);
    width.set(slot.width);
    height.set(slot.height);
    target.set(slot.left);
    if (instant || reduce) x.jump(slot.left);
  }

  // Rest on the selected tab; re-measure when the dock resizes.
  useLayoutEffect(() => {
    if (under !== null || selected < 0) {
      shown.current = under !== null;
      return;
    }
    // Appearing from nothing (e.g. from Draft studio) lands in place instead of gliding.
    place(measure()[selected], !shown.current);
    shown.current = true;
    const observer = new ResizeObserver(() =>
      place(measure()[selected], true),
    );
    if (nav.current) observer.observe(nav.current);
    return () => observer.disconnect();
  }, [selected, under, reduce]);

  function follow(g: Gesture, clientX: number) {
    const first = g.slots[0];
    const last = g.slots[g.slots.length - 1];
    const left = Math.min(
      Math.max(clientX - g.origin - first.width / 2, first.left - 8),
      last.left + 8,
    );
    target.set(left);
    if (reduce) x.jump(left);
    const index = nearest(g.slots, left);
    if (index !== underRef.current) haptic("selection");
    underRef.current = index;
    setUnder(index);
  }
  function end(g: Gesture, commit: boolean) {
    gesture.current = null;
    if (!g.active) return;
    const index = nearest(g.slots, target.get());
    underRef.current = null;
    setUnder(null);
    // The click that may follow this release is swallowed; later ones are not.
    setTimeout(() => (dragged.current = false));
    if (!commit || index === selected) {
      if (selected >= 0) place(g.slots[selected], false);
      return;
    }
    place(g.slots[index], false);
    go(items[index].path);
  }

  const handlers = {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        (event.target as Element).closest(".dock-fab-slot")
      )
        return;
      dragged.current = false;
      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        origin: event.currentTarget.getBoundingClientRect().left,
        slots: measure(),
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || g.id !== event.pointerId) return;
      if (!g.active) {
        const dx = Math.abs(event.clientX - g.startX);
        const dy = Math.abs(event.clientY - g.startY);
        if (dx < 8 || dx < dy) return;
        g.active = true;
        dragged.current = true;
        underRef.current = selected >= 0 ? selected : null;
        event.currentTarget.setPointerCapture(event.pointerId);
        top.set(g.slots[0].top);
        width.set(g.slots[0].width);
        height.set(g.slots[0].height);
        // Starting with no tab selected: appear under the finger, not glide in.
        if (selected < 0)
          x.jump(event.clientX - g.origin - g.slots[0].width / 2);
      }
      follow(g, event.clientX);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (g?.id === event.pointerId) end(g, true);
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (g?.id === event.pointerId) end(g, false);
    },
    // A drag ends on some button; that click must not also navigate.
    onClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (!dragged.current) return;
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return {
    nav,
    tabs,
    under,
    visible,
    handlers,
    style: reduce
      ? { x, top, width, height }
      : { x, top, width, height, scaleX, scaleY },
  };
}
