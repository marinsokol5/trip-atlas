import { useEffect, useId, useRef, useState } from "react";
import { mapDurationFilters } from "./view-model";
import type { MapDurationFilter } from "./view-model";

const durationLabels: Record<MapDurationFilter, string> = {
  all: "All",
  flights: "Flights",
  none: "None",
  "30": ">30m",
  "60": ">1h",
  "120": ">2h",
  "240": ">4h",
};

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
    const observer = new ResizeObserver(position);
    observer.observe(node);
    node.querySelector<HTMLInputElement>("input")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        // Wait for native Tab navigation. An interior pointer click can blur
        // to the document, so keyboard dismissal must work there too.
        requestAnimationFrame(() => {
          if (!root.current?.contains(document.activeElement)) setOpen(false);
        });
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keyboard);
      node.hidePopover();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  return (
    <div className="map-label-menu" ref={root}>
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
          {mapDurationFilters.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name={`${id}-durations`}
                value={value}
                checked={durationFilter === value}
                onChange={() => setDurationFilter(value)}
              />
              <span>{durationLabels[value]}</span>
            </label>
          ))}
        </fieldset>
        <details className="map-about">
          <summary>About this map</summary>
          <p>
            Routes connect your stops; they do not trace roads. When times are
            missing, movement and bar widths illustrate the plan, not an exact
            schedule. ~ marks estimates from your itinerary.
          </p>
        </details>
      </div>
    </div>
  );
}
