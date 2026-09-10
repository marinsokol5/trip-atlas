import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

type Option = { value: string; label: string };
/** A native top-layer popover keeps options themed and clear of clipped map panes. */
export function ThemedSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useRef({ text: "", at: 0 });
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const reveal = () => {
    setActive(selected);
    setOpen(true);
  };
  const choose = (index: number) => {
    if (options[index] && options[index].value !== value)
      onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    const node = popup.current;
    if (!open || !node) return;
    node.showPopover();
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect();
      node.style.minWidth = `${Math.min(rect.width, window.innerWidth - 16)}px`;
      node.style.maxWidth = `${window.innerWidth - 16}px`;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      node.style.maxHeight = `${Math.min(280, Math.max(below, above))}px`;
      const height = node.getBoundingClientRect().height;
      node.style.top = `${below >= height || below >= above ? rect.bottom + 4 : rect.top - height - 4}px`;
      node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - node.getBoundingClientRect().width - 8))}px`;
    };
    position();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      node.hidePopover();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      popup.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const current = open ? active : selected;
      setOpen(true);
      setActive(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : Math.max(
                0,
                Math.min(
                  options.length - 1,
                  current + (event.key === "ArrowDown" ? 1 : -1),
                ),
              ),
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else reveal();
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = performance.now();
      search.current.text =
        (now - search.current.at < 700 ? search.current.text : "") +
        event.key.toLowerCase();
      search.current.at = now;
      const match = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(search.current.text),
      );
      if (match >= 0) {
        setActive(match);
        setOpen(true);
      }
    }
  };
  return (
    <span className="themed-select" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        title={title}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget as Node | null))
            setOpen(false);
        }}
        onClick={() => (open ? setOpen(false) : reveal())}
      >
        <span>{options[selected]?.label ?? ""}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <div
        ref={popup}
        id={id}
        className="select-popup"
        popover="manual"
        role="listbox"
        aria-label={label}
      >
        {options.map((option, index) => (
          <div
            id={`${id}-${index}`}
            key={option.value}
            role="option"
            aria-selected={option.value === value}
            data-active={index === active}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => setActive(index)}
            onClick={() => choose(index)}
          >
            {option.label}
            <span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
          </div>
        ))}
      </div>
    </span>
  );
}
