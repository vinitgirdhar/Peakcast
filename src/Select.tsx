import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="select-options"
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              data-value={option.value}
              id={`${listId}-${option.value}`}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              aria-selected={option.value === value}
              key={option.value}
              disabled={option.disabled}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                root.current
                  ?.querySelector<HTMLButtonElement>('[role="combobox"]')
                  ?.focus();
              }}
            >
              {option.label}
              {option.value === value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
