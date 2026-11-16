import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Bell,
  CircleCheck,
  CircleX,
  Coins,
  Gavel,
  MessageSquare,
  ShieldAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { WildcatterClient } from "../shared/client.js";
import type { Inbox, NotificationKind } from "../shared/types.js";
import { EmptyState, SkeletonRows, date, errorMessage } from "./ui.js";
import { ease, itemMotion, listMotion } from "./motion.js";

const kinds: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  order_filled: { icon: CircleCheck, tone: "yes" },
  order_cancelled: { icon: CircleX, tone: "no" },
  payout: { icon: Coins, tone: "yes" },
  outcome_proposed: { icon: Gavel, tone: "info" },
  dispute_filed: { icon: ShieldAlert, tone: "warn" },
  market_resolved: { icon: BadgeCheck, tone: "info" },
  comment: { icon: MessageSquare, tone: "info" },
};

/** "Just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return date(iso);
}

interface BellProps {
  client: WildcatterClient;
  /** Null until the first refresh returns. */
  inbox: Inbox | null;
  onInbox: (inbox: Inbox) => void;
  onOpenMarket: (marketId: string) => void;
}

/** Top-bar bell with an unread badge; opening it marks everything read. */
export function NotificationBell({
  client,
  inbox,
  onInbox,
  onOpenMarket,
}: BellProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // The bell sits in a glass pill whose backdrop-filter would trap and clip a
  // positioned child, so the panel renders into the top bar instead.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const panelId = useId();
  const unread = inbox?.unread ?? 0;
  useEffect(() => setHost(bell.current?.closest("header") ?? null), []);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) bell.current?.focus({ preventScroll: true });
  }

  async function load() {
    setError("");
    setLoading(true);
    try {
      const fresh = await client.notifications();
      onInbox(fresh);
      if (fresh.unread) {
        await client.markNotificationsRead();
        // Keep each item's read flag so this visit still shows what was new.
        onInbox({ ...fresh, unread: 0 });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !bell.current?.contains(target))
        close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const items = inbox?.items ?? [];
  const fresh = items.filter((item) => !item.read).length;
  return (
    <>
      <button
        ref={bell}
        className="icon-button notification-bell"
        aria-label={
          unread ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (open) return close(false);
          setOpen(true);
          void load();
        }}
      >
        <Bell size={19} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              className="notification-badge"
              aria-hidden="true"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.18, ease }}
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      {host &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panel}
                id={panelId}
                className="notification-panel"
                role="dialog"
                aria-label="Notifications"
                tabIndex={-1}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease }}
              >
                <div className="notification-head">
                  <h2>Notifications</h2>
                  {fresh > 0 && (
                    <span className="panel-summary">{fresh} new</span>
                  )}
                  <button
                    className="icon-button"
                    aria-label="Close notifications"
                    onClick={() => close(true)}
                  >
                    <X size={17} />
                  </button>
                </div>
                {error ? (
                  <div role="alert" className="form-error inline-error">
                    <p>{error}</p>
                    <button className="text-button" onClick={() => void load()}>
                      Try again
                    </button>
                  </div>
                ) : !inbox && loading ? (
                  <SkeletonRows label="Loading notifications…" count={3} />
                ) : items.length ? (
                  <motion.ul
                    className="notification-list"
                    variants={listMotion}
                    initial="hidden"
                    animate="show"
                  >
                    {items.map((item) => {
                      const { icon: Icon, tone } =
                        kinds[item.kind] ?? kinds.comment;
                      const body = (
                        <>
                          <span
                            className={`soft-icon notification-icon ${tone}`}
                          >
                            <Icon size={17} />
                          </span>
                          <span className="notification-text">
                            {!item.read && (
                              <span className="sr-only">New: </span>
                            )}
                            {item.text}
                            <time
                              className="row-meta"
                              dateTime={item.createdAt}
                              title={new Date(item.createdAt).toLocaleString()}
                            >
                              {timeAgo(item.createdAt)}
                            </time>
                          </span>
                          {!item.read && (
                            <span
                              className="notification-dot"
                              aria-hidden="true"
                            />
                          )}
                        </>
                      );
                      return (
                        <motion.li key={item.id} variants={itemMotion}>
                          {item.marketId ? (
                            <button
                              className="notification-row"
                              onClick={() => {
                                close(true);
                                onOpenMarket(item.marketId!);
                              }}
                            >
                              {body}
                            </button>
                          ) : (
                            <div className="notification-row">{body}</div>
                          )}
                        </motion.li>
                      );
                    })}
                  </motion.ul>
                ) : (
                  <EmptyState
                    compact
                    title="You're all caught up."
                    text="Order fills, payouts and news on markets you trade show up here."
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          host,
        )}
    </>
  );
}
