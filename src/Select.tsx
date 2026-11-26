import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { haptic } from "./haptics.js";
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export function Select({
  id,
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label: string;
  disabled?: boolean;
}) {
  const generated = useId();
  const listId = generated + "-list";
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const enabled = options.filter((option) => !option.disabled);
  return (
    <div
      ref={root}
      className="custom-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open ? `${listId}-${value}` : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const index = enabled.findIndex((option) => option.value === value);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? enabled.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      enabled.length) %
                    enabled.length;
            if (enabled[next]) onChange(enabled[next].value);
          }
        }}
      >
        <span>
          {options.find((option) => option.value === value)?.label ??
            "Choose an option"}
        </span>
        <ChevronDown size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <Options
            listId={listId}
            label={label}
            value={value}
            options={options}
            onPick={(next) => {
              if (next !== value) haptic("selection");
              onChange(next);
              setOpen(false);
              root.current
                ?.querySelector<HTMLButtonElement>('[role="combobox"]')
                ?.focus();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** The open list: springs in, and while it fades out it drops its roles and ids so it never duplicates the next list. */
function Options({
  listId,
  label,
  value,
  options,
  onPick,
}: {
  listId: string;
  label: string;
  value: string;
  options: SelectOption[];
  onPick: (value: string) => void;
}) {
  const present = useIsPresent();
  // The highlight follows the pointer and rests on the selected option.
  const [hovered, setHovered] = useState<string | null>(null);
  const lit = hovered ?? value;
  return (
    <motion.div
      id={present ? listId : undefined}
      role={present ? "listbox" : undefined}
      aria-label={present ? label : undefined}
      aria-hidden={present ? undefined : true}
      className="select-options"
      style={{
        transformOrigin: "top",
        pointerEvents: present ? undefined : "none",
      }}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", stiffness: 560, damping: 36 }}
      onPointerLeave={() => setHovered(null)}
    >
      {options.map((option) => (
        <button
          type="button"
          role={present ? "option" : undefined}
          data-value={present ? option.value : undefined}
          id={present ? `${listId}-${option.value}` : undefined}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onPointerEnter={() => !option.disabled && setHovered(option.value)}
          aria-selected={present ? option.value === value : undefined}
          key={option.value}
          disabled={option.disabled}
          onClick={() => onPick(option.value)}
        >
          {option.value === lit && (
            <motion.span
              className="select-highlight"
              layoutId={`${listId}-highlight`}
              transition={{ type: "spring", stiffness: 600, damping: 40 }}
            />
          )}
          {option.label}
          {option.value === value && <Check size={16} />}
        </button>
      ))}
    </motion.div>
  );
}
