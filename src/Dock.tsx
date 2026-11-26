import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
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

  const tab = ({ path, label, icon: Icon }: DockItem) => (
    <button
      key={path}
      onClick={() => {
        if (section !== label) haptic("selection");
        if (open) choose(path);
        else onNavigate(path);
      }}
      aria-current={section === label ? "page" : undefined}
      className={section === label ? "selected" : ""}
    >
      {section === label && (
        <motion.span
          className="dock-selection"
          layoutId="dock-selection"
          // Near-critical spring: glides and settles without a visible bounce.
          transition={spring}
        />
      )}
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
      <nav className="mobile-dock" aria-label="Quick navigation">
        {items.slice(0, 2).map(tab)}
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
        {items.slice(2).map(tab)}
      </nav>
    </>
  );
}
