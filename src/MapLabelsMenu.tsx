import { useEffect, useId, useRef, useState } from "react";
import type { MapDurationFilter } from "./view-model";

export function MapLabelsMenu({
  showEndpoints,
  setShowEndpoints,
  showGroupNames,
  setShowGroupNames,
  durationFilter,
  setDurationFilter,
}: {
  showEndpoints: boolean;
  setShowEndpoints: (value: boolean) => void;
  showGroupNames: boolean;
  setShowGroupNames: (value: boolean) => void;
  durationFilter: MapDurationFilter;
  setDurationFilter: (value: MapDurationFilter) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const node = popup.current;
    if (!open || !node) return;
    node.showPopover();
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect();
      node.style.maxWidth = `${window.innerWidth - 16}px`;
      node.style.maxHeight = `${window.innerHeight - 16}px`;
      const bounds = node.getBoundingClientRect();
      node.style.left = `${Math.max(8, Math.min(rect.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
      node.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - bounds.height - 8))}px`;
    };
    position();
    node.querySelector<HTMLInputElement>("input")?.focus();
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
  return (
    <div
      className="map-label-menu"
      ref={root}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        Map labels <span aria-hidden="true">▾</span>
      </button>
      <div
        ref={popup}
        id={id}
        className="map-label-popup"
        popover="manual"
        role="dialog"
        aria-label="Map labels"
      >
        <label className="map-label-option">
          <input
            type="checkbox"
            checked={showEndpoints}
            onChange={(event) => setShowEndpoints(event.target.checked)}
          />
          Start / Finish
        </label>
        <label className="map-label-option">
          <input
            type="checkbox"
            checked={showGroupNames}
            onChange={(event) => setShowGroupNames(event.target.checked)}
          />
          Place / group names
        </label>
        <fieldset className="map-duration-options">
          <legend>Transport durations</legend>
          {(
            [
              ["all", "All"],
              ["30", ">30m"],
              ["60", ">1h"],
              ["120", ">2h"],
              ["240", ">4h"],
              ["none", "None"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={`${id}-durations`}
                value={value}
                checked={durationFilter === value}
                onChange={() => setDurationFilter(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
