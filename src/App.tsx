import {
  Map as MapIcon,
  LayoutDashboard,
  Calendar as CalendarIcon,
  BedDouble,
  Sun,
  Moon,
  TrainFront,
  Bus,
  Footprints,
  Plane,
  Ship,
  Car,
  ArrowRight,
  Plus,
  Minus,
  Maximize,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  Fragment,
  useSyncExternalStore,
  useCallback,
} from "react";
import type { CSSProperties } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { documentUrl, normalizeTrip, safeRelativePath } from "./itinerary";
import type { Itinerary, NormalizedDay, DocumentLink, Leg } from "./itinerary";
import {
  activeLegs,
  clockAt,
  curvePoint,
  dateLabel,
  dayLabel,
  dayTitle,
  dayGroups,
  momentAt,
  mapMomentAt,
  mapAreas,
  mapHighlightedCountries,
  areaDays,
  scopedPosition,
  tripPosition,
  advancePlayback,
  mapArea,
  componentLegs,
  placeColor,
  visualGroups,
  groupKey,
  modeKind,
  legDuration,
  dayBands,
  mapRoute,
  mapPointStyle,
  transferPlaces,
  mapDisplayConnections,
  mapDisplayDuration,
  directedCurvePoint,
  zoomMap,
  wheelZoomFactor,
  scopedCalendarSlots,
  calendarCountries,
  routeCurve,
} from "./view-model";
import type { Point, MapDurationFilter } from "./view-model";
import world from "./assets/world.json";
import "./App.css";
import { Overview } from "./Overview";
import { ThemedSelect } from "./ThemedSelect";
import { MapLabelsMenu } from "./MapLabelsMenu";
import { useMapLabelPreference } from "./use-map-label-preference";

type Entry = { path: string; label: string; title?: string };
// Only animation consumers subscribe to frame updates. App receives semantic changes.
function createPlayhead() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: number) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
  };
}
type Playhead = ReturnType<typeof createPlayhead>;
function positionReadout(model: Itinerary, value: number) {
  const moment = momentAt(model, value);
  const day = model.days[Math.min(model.days.length - 1, Math.floor(value))];
  const status = moment.leg
    ? `${name(model, moment.leg.from)} → ${name(model, moment.leg.to)}`
    : moment.place
      ? `In ${name(model, moment.place)}`
      : "Route";
  const time = moment.leg
    ? `${clockAt(model, moment.at, moment.leg.from)} → ${clockAt(model, moment.at, moment.leg.to)}`
    : clockAt(model, moment.at, moment.place);
  return { readout: `${dayLabel(day)} · ${time ?? "Planned day"}`, status };
}
function TimelineOutput({
  model,
  clock,
}: {
  model: Itinerary;
  clock: Playhead;
}) {
  const value = useSyncExternalStore(clock.subscribe, clock.get);
  return (
    <output htmlFor="trip-time">{positionReadout(model, value).readout}</output>
  );
}
function TimelineInput({
  model,
  clock,
  days,
  selectPosition,
}: {
  model: Itinerary;
  clock: Playhead;
  days: NormalizedDay[];
  selectPosition: (value: number) => void;
}) {
  const value = useSyncExternalStore(clock.subscribe, clock.get);
  const { readout, status } = positionReadout(model, value);
  return (
    <input
      id="trip-time"
      aria-label="Trip timeline"
      aria-valuetext={`${readout}. ${status}`}
      type="range"
      min="0"
      max={days.length - 0.01}
      step="0.01"
      value={scopedPosition(days, value)}
      onChange={(event) =>
        selectPosition(tripPosition(days, Number(event.target.value)))
      }
    />
  );
}
const playbackSpeeds = [0.5, 1, 2, 4, 8];
const name = (model: Itinerary, id?: string) =>
  id ? (model.trip.places[id].name ?? id) : "Location open";
const color = placeColor;
async function json(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${response.statusText}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${path}: invalid JSON`);
  }
}
function Icon({ kind }: { kind: string }) {
  const Component =
    (
      {
        overview: LayoutDashboard,
        map: MapIcon,
        calendar: CalendarIcon,
        bed: BedDouble,
        sun: Sun,
        moon: Moon,
        train: TrainFront,
        bus: Bus,
        walk: Footprints,
        flight: Plane,
        ferry: Ship,
        car: Car,
        other: ArrowRight,
        plus: Plus,
        minus: Minus,
        reset: Maximize,
        prev: ChevronLeft,
        next: ChevronRight,
        link: ExternalLink,
        play: Play,
        pause: Pause,
        replay: RotateCcw,
      } as Record<string, typeof MapIcon>
    )[kind] ?? ArrowRight;
  return <Component className="icon" aria-hidden="true" strokeWidth={1.6} />;
}
function LegChip({ leg }: { leg: Leg }) {
  if (leg.block.components)
    return (
      <>
        {componentLegs(leg).map((c) => (
          <LegChip key={c.id} leg={c} />
        ))}
        {legDuration(leg) && (
          <span
            className="leg-chip"
            title={
              leg.block.components.every(
                (part) => part.estimatedDurationMinutes !== undefined,
              )
                ? "Whole connection total; component estimates shown separately"
                : "Whole connection; missing mode durations are not allocated"
            }
          >
            {legDuration(leg)} total
          </span>
        )}
      </>
    );
  return (
    <span className="leg-chip" title={leg.block.mode ?? "Travel"}>
      <Icon kind={modeKind(leg)} />
      <span>{legDuration(leg)}</span>
      <span className="sr-only">{modeKind(leg)}</span>
    </span>
  );
}
function Bands({ model, day }: { model: Itinerary; day: NormalizedDay }) {
  return (
    <div
      className="bands"
      aria-label={
        day.hasUnknownTiming
          ? "Schematic sequence; widths estimated, not clock times"
          : "Elapsed day proportions"
      }
    >
      {dayBands(model, day).map((b, i) => (
        <span
          key={i}
          className={b.transfer ? "transit-band" : ""}
          style={{ flex: b.weight, backgroundColor: color(model, b.place) }}
        />
      ))}
    </div>
  );
}
function useCompactScreen() {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}
function Traveler({
  model,
  clock,
  geometry,
  view,
  frameSize,
  frameScale,
  status,
}: {
  model: Itinerary;
  clock: Playhead;
  geometry: {
    points: Record<string, Point>;
    routes: {
      leg: Leg;
      reverseLeg?: Leg;
      curve: ReturnType<typeof routeCurve>;
    }[];
  };
  view: { x: number; y: number; k: number };
  frameSize: { width: number; height: number };
  frameScale: number;
  status: string;
}) {
  const value = useSyncExternalStore(clock.subscribe, clock.get);
  const moment = mapMomentAt(model, value);
  const screen = (point: Point): Point => [
    (view.x + point[0] * view.k) * frameScale,
    (view.y + point[1] * view.k) * frameScale,
  ];
  const active = geometry.routes.find(
    (r) => r.leg.id === moment.leg?.id || r.reverseLeg?.id === moment.leg?.id,
  );
  const marker =
    moment.leg && active && moment.progress !== undefined
      ? directedCurvePoint(
          active.curve,
          moment.progress,
          active.reverseLeg?.id === moment.leg.id,
        )
      : moment.place
        ? geometry.points[moment.place]
        : undefined;
  let heading = 0;
  if (active && moment.leg && moment.progress !== undefined) {
    const reverse = active.reverseLeg?.id === moment.leg.id;
    const t = reverse ? 1 - moment.progress : moment.progress;
    const { a, b, c } = active.curve;
    const direction = reverse ? -1 : 1;
    const dx = direction * ((1 - t) * (c[0] - a[0]) + t * (b[0] - c[0]));
    const dy = direction * ((1 - t) * (c[1] - a[1]) + t * (b[1] - c[1]));
    heading = (Math.atan2(dy, dx) * 180) / Math.PI + 45;
  }
  const markerPosition = marker
    ? {
        left: (frameSize.width - 900 * frameScale) / 2 + screen(marker)[0],
        top: (frameSize.height - 480 * frameScale) / 2 + screen(marker)[1],
      }
    : undefined;
  const markerLabel = moment.leg
    ? `${name(model, moment.leg.from)} → ${name(model, moment.leg.to)}`
    : moment.place
      ? name(model, moment.place)
      : status;
  return (
    <>
      {marker && markerPosition && (
        <div
          className="map-airplane"
          data-testid="traveler"
          data-place={moment.place ?? ""}
          data-leg={moment.leg?.id ?? ""}
          data-schematic={moment.schematic}
          data-map-x={marker[0]}
          data-map-y={marker[1]}
          style={markerPosition}
          role="img"
          aria-label={`${markerLabel} · ${moment.schematic ? "illustrative" : "selected"} position`}
        >
          <Plane
            style={{ transform: `rotate(${heading}deg)` }}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </div>
      )}
    </>
  );
}
function MapPlaceTooltip({
  text,
  x,
  y,
  width,
  height,
}: {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const bounds = node.current?.getBoundingClientRect();
    if (bounds) setSize({ width: bounds.width, height: bounds.height });
  }, [text, width]);
  return (
    <div
      ref={node}
      className="map-place-tooltip"
      role="tooltip"
      style={{
        left: Math.max(8, Math.min(x - size.width / 2, width - size.width - 8)),
        top: Math.max(
          8,
          Math.min(y - size.height - 14, height - size.height - 8),
        ),
        maxWidth: width - 16,
      }}
    >
      {text}
    </div>
  );
}

function TripMap({
  model,
  value,
  clock,
  country,
  status,
  day,
  playing,
  atEnd,
  togglePlayback,
  playbackSpeed,
  changePlaybackSpeed,
}: {
  model: Itinerary;
  value: number;
  clock: Playhead;
  country: string;
  status: string;
  day: NormalizedDay;
  playing: boolean;
  atEnd: boolean;
  togglePlayback: () => void;
  playbackSpeed: number;
  changePlaybackSpeed: (speed: number) => void;
}) {
  const moment = mapMomentAt(model, value);
  const highlightedCountries = useMemo(
    () => mapHighlightedCountries(model, country),
    [model, country],
  );
  const [showEndpoints, setShowEndpoints] = useMapLabelPreference(
    "start-finish",
    true,
  );
  const [showGroupNames, setShowGroupNames] = useMapLabelPreference(
    "group-names",
    false,
  );
  const [tooltipPlace, setTooltipPlace] = useState<string | null>(null);

  const area = useMemo(() => mapArea(model, country), [model, country]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [viewCountry, setViewCountry] = useState(country);
  if (viewCountry !== country) {
    setViewCountry(country);
    setView({ x: 0, y: 0, k: 1 });
  }
  const [durationFilter, setDurationFilter] = useState<MapDurationFilter>(
    () => {
      try {
        const saved = window.localStorage.getItem("trip-atlas-duration-filter");
        if (saved && ["all", "30", "60", "120", "240", "none"].includes(saved))
          return saved as MapDurationFilter;
      } catch {
        // Defaults remain usable when browser storage is unavailable.
      }
      return "60";
    },
  );
  const frame = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 900, height: 480 });
  const frameScale = Math.min(frameSize.width / 900, frameSize.height / 480);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0)
        setFrameSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setTooltipPlace(null);
      const rect = node.getBoundingClientRect();
      const scale = Math.min(rect.width / 900, rect.height / 480);
      if (!scale) return;
      const anchor: Point = [
        (event.clientX - rect.left - (rect.width - 900 * scale) / 2) / scale,
        (event.clientY - rect.top - (rect.height - 480 * scale) / 2) / scale,
      ];
      setView((view) =>
        zoomMap(
          view,
          wheelZoomFactor(event.deltaY, event.deltaMode, rect.height),
          anchor,
        ),
      );
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);
  const pixelScale = frameScale * view.k;
  const numbered = !showGroupNames;
  const dragged = useRef(false);
  const drag = useRef<
    { x: number; y: number; vx: number; vy: number } | undefined
  >(undefined);
  const { groups, first, last } = area;
  const transfers = useMemo(() => transferPlaces(model), [model]);
  const connections = useMemo(
    () => mapDisplayConnections(model, country),
    [model, country],
  );
  const geometry = useMemo(() => {
    const locations = Object.entries(model.trip.places)
      .filter(([id, p]) => area.placeIds.has(id) && p.coordinates)
      .map(([id, p]) => ({
        id,
        coordinates: [p.coordinates!.lon, p.coordinates!.lat] as Point,
      }));
    // Center across the largest longitude gap so a dateline crossing stays together.
    const lons = locations
      .map((p) => (p.coordinates[0] + 360) % 360)
      .sort((a, b) => a - b);
    let center = 0;
    if (lons.length) {
      const gaps = lons.map((lon, i) => ({
        gap:
          lons[(i + 1) % lons.length] + (i === lons.length - 1 ? 360 : 0) - lon,
        i,
      }));
      const gap = gaps.sort((a, b) => b.gap - a.gap)[0];
      center = (lons[(gap.i + 1) % lons.length] + (360 - gap.gap) / 2) % 360;
    }
    const projection = geoMercator()
      .rotate([-center, 0])
      .scale(1)
      .translate([0, 0]);
    const raw = locations.map((p) => projection(p.coordinates)!);
    if (raw.length) {
      const xs = raw.map((p) => p[0]),
        ys = raw.map((p) => p[1]);
      const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys);
      const scale = Math.min(
        690 / Math.max(maxX - minX, 0.035),
        280 / Math.max(maxY - minY, 0.035),
      );
      projection
        .scale(scale)
        .translate([
          450 - ((minX + maxX) / 2) * scale,
          260 - ((minY + maxY) / 2) * scale,
        ]);
    } else projection.scale(135).translate([450, 260]);
    const points = Object.fromEntries(
      locations.map((p) => [p.id, projection(p.coordinates)!]),
    );
    const routes = connections.flatMap(({ outbound, inbound }) =>
      outbound.legs.flatMap((leg, index) =>
        leg.from && points[leg.from] && points[leg.to]
          ? [
              {
                leg,
                reverseLeg: inbound?.legs[inbound.legs.length - 1 - index],
                curve: routeCurve(points[leg.from], points[leg.to]),
              },
            ]
          : [],
      ),
    );
    const path = geoPath(projection);
    const shapes = world.features.map((feature, i) => ({
      id: i,
      path: path(feature as unknown as GeoPermissibleObjects),
      name: feature.properties.name,
      country: feature.properties.iso2,
    }));
    // Prefer an overnight base over an area's transfer waypoint for its numbered label.
    const labels = groups.flatMap((group) => {
      const id =
        group.members.find((id) => points[id] && !transfers.has(id)) ??
        group.members.find((id) => points[id]);
      return id
        ? [
            {
              id,
              name: group.name,
              transfer: group.members.every((id) => transfers.has(id)),
            },
          ]
        : [];
    });
    return { points, routes, shapes, labels };
  }, [model, area, groups, transfers, connections]);
  // Lay out text in physical pixels again after zooming, so labels never scale or collide.
  const screen = (point: Point): Point => [
    (view.x + point[0] * view.k) * frameScale,
    (view.y + point[1] * view.k) * frameScale,
  ];
  const unproject = (point: Point): Point => [
    (point[0] / frameScale - view.x) / view.k,
    (point[1] / frameScale - view.y) / view.k,
  ];
  const occupied: { x: number; y: number; width: number; height: number }[] =
    [];
  const visible = ([x, y]: Point) =>
    x >= 4 && x <= 900 * frameScale - 4 && y >= 4 && y <= 480 * frameScale - 4;
  for (const [id, point] of Object.entries(geometry.points)) {
    const [x, y] = screen(point),
      radius = transfers.has(id) ? 4 : 8;
    occupied.push({
      x: x - radius,
      y: y - radius,
      width: radius * 2,
      height: radius * 2,
    });
    if (showEndpoints && (id === first || id === last)) {
      const width = first === last ? 72 : 38;
      occupied.push({ x: x - width / 2, y: y + 9, width, height: 14 });
    }
  }
  const placeLabel = (
    anchor: Point,
    width: number,
    height: number,
    offsets: Point[],
  ) => {
    const [x, y] = screen(anchor);
    if (!visible([x, y])) return undefined;
    const candidate = offsets
      .map(([dx, dy]) => ({ x: x + dx, y: y + dy, width, height }))
      .find(
        (p) =>
          p.x >= 5 &&
          p.y >= 5 &&
          p.x + width <= 900 * frameScale - 5 &&
          p.y + height <= 480 * frameScale - 5 &&
          occupied.every(
            (q) =>
              p.x + width + 4 < q.x ||
              q.x + q.width + 4 < p.x ||
              p.y + height + 4 < q.y ||
              q.y + q.height + 4 < p.y,
          ),
      );
    if (!candidate) return undefined;
    occupied.push(candidate);
    return unproject([candidate.x, candidate.y]);
  };
  const pointLabels = geometry.labels.flatMap((label) => {
    const width = numbered ? 18 : label.name.length * 7;
    const position = placeLabel(geometry.points[label.id], width, 15, [
      [13, -25],
      [13, 10],
      [-width - 13, -25],
      [-width - 13, 10],
      [10, -40],
      [10, 26],
      [-width - 10, -40],
      [-width - 10, 26],
      [10, -60],
      [10, 46],
      [-width - 10, -60],
      [-width - 10, 46],
    ]);
    return position ? [{ ...label, position }] : [];
  });
  let durationLabelCandidates = 0;
  const connectionLabels = connections.flatMap((connection) => {
    const text = mapDisplayDuration(model, connection, durationFilter);
    if (!text) return [];
    const routes = geometry.routes.filter((route) =>
      connection.outbound.legs.some((leg) => leg.id === route.leg.id),
    );
    const route = routes.sort(
      (a, b) =>
        Math.hypot(b.curve.b[0] - b.curve.a[0], b.curve.b[1] - b.curve.a[1]) -
        Math.hypot(a.curve.b[0] - a.curve.a[0], a.curve.b[1] - a.curve.a[1]),
    )[0];
    if (!route) return [];
    durationLabelCandidates++;
    const anchor = curvePoint(route.curve, 0.5);
    const width = text.length * 7 + 12;
    const position = placeLabel(anchor, width, 22, [
      [8, -26],
      [8, 8],
      [-width - 8, -26],
      [-width - 8, 8],
      [8, -54],
      [8, 36],
      [-width - 8, -54],
      [-width - 8, 36],
      [35, -26],
      [-width - 35, 8],
      ...[-80, 64, -108, 92].flatMap((dy) =>
        [-width - 60, -width / 2, 60].map((dx) => [dx, dy] as Point),
      ),
      ...Array.from(
        { length: Math.max(0, Math.floor((480 * frameScale - 32) / 28)) },
        (_, row) =>
          Array.from(
            {
              length: Math.max(
                0,
                Math.floor((900 * frameScale - 10) / (width + 10)),
              ),
            },
            (_, column) =>
              [
                5 + column * (width + 10) - screen(anchor)[0],
                5 + row * 28 - screen(anchor)[1],
              ] as Point,
          ),
      ).flat(),
    ]);
    return position ? [{ connection, anchor, position, width, text }] : [];
  });
  const markerLabel = moment.leg
    ? `${name(model, moment.leg.from)} → ${name(model, moment.leg.to)}`
    : moment.place
      ? name(model, moment.place)
      : status;
  const selected = new Set(activeLegs(model, day).map((l) => l.id));
  const zoom = (factor: number) => {
    setTooltipPlace(null);
    setView((view) => zoomMap(view, factor));
  };
  return (
    <>
      <div className="map-canvas" data-testid="map-canvas">
        <div className="map-header">
          <div className="map-caption">
            <span>{dayLabel(day)}</span>
            <strong>{markerLabel}</strong>
          </div>
          <div className="map-controls">
            <div
              className="map-primary-controls"
              role="group"
              aria-label="Map zoom"
            >
              <button aria-label="Zoom in" onClick={() => zoom(1.5)}>
                <Icon kind="plus" />
              </button>
              <button aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}>
                <Icon kind="minus" />
              </button>
              <button
                aria-label="Fit selected area"
                title="Fit selected area"
                onClick={() => {
                  setTooltipPlace(null);
                  setView({ x: 0, y: 0, k: 1 });
                }}
              >
                <Icon kind="reset" />
              </button>
            </div>
            <div
              className="map-secondary-controls"
              role="group"
              aria-label="Playback and map labels"
            >
              <div className="map-playback-cluster">
                <button
                  onClick={togglePlayback}
                  className="playback-toggle"
                  aria-label={
                    playing
                      ? "Pause itinerary"
                      : atEnd
                        ? "Replay itinerary"
                        : "Play itinerary"
                  }
                  aria-pressed={playing}
                >
                  <Icon kind={playing ? "pause" : atEnd ? "replay" : "play"} />
                  {playing ? "Pause" : atEnd ? "Replay" : "Play"}
                </button>
                <label className="map-speed-slider">
                  <output>{playbackSpeed}×</output>
                  <input
                    type="range"
                    min="0"
                    max={playbackSpeeds.length - 1}
                    step="1"
                    value={playbackSpeeds.indexOf(playbackSpeed)}
                    aria-label="Playback speed"
                    aria-valuetext={`${playbackSpeed}×`}
                    title="1× advances one itinerary day every three seconds"
                    onChange={(event) =>
                      changePlaybackSpeed(
                        playbackSpeeds[Number(event.target.value)],
                      )
                    }
                  />
                </label>
              </div>
              <MapLabelsMenu
                showEndpoints={showEndpoints}
                setShowEndpoints={setShowEndpoints}
                showGroupNames={showGroupNames}
                setShowGroupNames={setShowGroupNames}
                durationFilter={durationFilter}
                setDurationFilter={(filter) => {
                  setDurationFilter(filter);
                  try {
                    window.localStorage.setItem(
                      "trip-atlas-duration-filter",
                      filter,
                    );
                  } catch {
                    // The selection still applies for this session.
                  }
                }}
              />
            </div>
          </div>
        </div>
        <div className="map-geometry" ref={frame}>
          <svg
            viewBox="0 0 900 480"
            role="group"
            aria-label={`Trip map. ${markerLabel}${moment.schematic ? ". Illustrative position" : ""}`}
            onPointerDown={(e) => {
              dragged.current = false;
              if (!(e.target as Element).closest("[data-place-hit]"))
                setTooltipPlace(null);
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                vx: view.x,
                vy: view.y,
              };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (start) {
                if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) {
                  dragged.current = true;
                  setTooltipPlace(null);
                }
                // React may apply this update after pointerup clears the drag ref.
                const x = start.vx + (e.clientX - start.x) / frameScale;
                const y = start.vy + (e.clientY - start.y) / frameScale;
                setView((v) => ({ ...v, x, y }));
              }
            }}
            onPointerUp={() => {
              drag.current = undefined;
            }}
            onPointerCancel={() => {
              drag.current = undefined;
            }}
          >
            <defs>
              {["route", "active"].map((id) => (
                <marker
                  key={id}
                  id={`${id}-arrow`}
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth={5 / pixelScale}
                  markerHeight={5 / pixelScale}
                  markerUnits="userSpaceOnUse"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M0 0 10 5 0 10Z"
                    fill={`var(--${id === "active" ? "blue" : "transit"})`}
                  />
                </marker>
              ))}
            </defs>
            <g
              transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
              data-testid="map-transform"
            >
              <g className="geography" aria-hidden="true">
                {geometry.shapes.map((s) => (
                  <path
                    key={s.id}
                    d={s.path ?? ""}
                    data-country={s.country || undefined}
                    className={
                      highlightedCountries.has(s.country)
                        ? "highlighted-country"
                        : undefined
                    }
                  >
                    <title>{s.name}</title>
                  </path>
                ))}
              </g>
              {geometry.routes.map(({ leg, reverseLeg, curve }) => {
                const internal =
                    groupKey(model, leg.from) === groupKey(model, leg.to) &&
                    modeKind(leg) === "walk",
                  isActive =
                    selected.has(leg.id) ||
                    (!!reverseLeg && selected.has(reverseLeg.id));
                const {
                  curve: c,
                  arrow,
                  arrowStart,
                } = mapRoute(
                  curve,
                  internal,
                  pixelScale,
                  mapPointStyle(
                    transfers.has(leg.to),
                    activeLegs(model, day).some(
                      (l) => l.from === leg.to || l.to === leg.to,
                    ),
                    moment.place === leg.to,
                  ),
                  mapPointStyle(
                    transfers.has(leg.from!),
                    activeLegs(model, day).some(
                      (l) => l.from === leg.from || l.to === leg.from,
                    ),
                    moment.place === leg.from,
                  ),
                  !!reverseLeg,
                );
                return (
                  <g key={leg.id}>
                    <path
                      data-leg={leg.id}
                      data-return-leg={reverseLeg?.id}
                      className={`route${isActive ? " active" : ""}`}
                      style={{
                        stroke: internal ? color(model, leg.to) : undefined,
                        strokeWidth: (isActive ? 1.9 : 1.15) / pixelScale,
                      }}
                      d={`M${c.a}Q${c.c} ${c.b}`}
                      markerStart={
                        arrowStart
                          ? `url(#${reverseLeg && selected.has(reverseLeg.id) ? "active" : "route"}-arrow)`
                          : undefined
                      }
                      markerEnd={
                        arrow
                          ? `url(#${selected.has(leg.id) ? "active" : "route"}-arrow)`
                          : undefined
                      }
                    >
                      <title>
                        {name(model, leg.from)} {reverseLeg ? "↔" : "→"}{" "}
                        {name(model, leg.to)}
                      </title>
                    </path>
                  </g>
                );
              })}
              {connectionLabels.map(
                ({ connection, anchor, position, width, text }) => (
                  <g
                    key={connection.outbound.id}
                    data-connection={connection.outbound.id}
                    data-return-connection={connection.inbound?.id}
                  >
                    <line
                      pointerEvents="none"
                      x1={anchor[0]}
                      y1={anchor[1]}
                      x2={position[0] + width / 2 / pixelScale}
                      y2={position[1] + 11 / pixelScale}
                      stroke="var(--transit)"
                      strokeWidth={0.5 / pixelScale}
                      opacity={0.5}
                    />
                    <foreignObject
                      className="route-label"
                      x={position[0]}
                      y={position[1]}
                      width={width / pixelScale}
                      height={22 / pixelScale}
                      overflow="visible"
                    >
                      <div
                        style={{
                          transform: `scale(${1 / pixelScale})`,
                          transformOrigin: "top left",
                          width,
                        }}
                      >
                        <span
                          className="connection-duration"
                          title={`${name(model, connection.outbound.from)} ${connection.inbound ? "↔" : "→"} ${name(model, connection.outbound.to)} · ${connection.inbound ? "One-way vehicle time (longer direction); return journey shown by both arrowheads" : connection.outbound.from === connection.outbound.to ? "Total vehicle time for this circuit" : "One-way vehicle time"}`}
                        >
                          {text}
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                ),
              )}
              {Object.entries(geometry.points).map(([id, p]) => {
                const point = mapPointStyle(
                  transfers.has(id),
                  activeLegs(model, day).some(
                    (l) => l.from === id || l.to === id,
                  ),
                );
                return (
                  <g
                    key={id}
                    data-place-point={id}
                    className={
                      transfers.has(id) ? "transfer-point" : "overnight-point"
                    }
                  >
                    <circle
                      cx={p[0]}
                      cy={p[1]}
                      r={point.radius / pixelScale}
                      fill={color(model, id)}
                      stroke="var(--paper)"
                      strokeWidth={point.stroke / pixelScale}
                    />
                    <circle
                      data-place-hit={id}
                      className="place-hit-target"
                      cx={p[0]}
                      cy={p[1]}
                      r={12 / pixelScale}
                      fill="transparent"
                      tabIndex={0}
                      role="button"
                      aria-label={name(model, id)}
                      onPointerDown={(event) => {
                        if (event.pointerType === "touch") setTooltipPlace(id);
                      }}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "touch" && !dragged.current)
                          setTooltipPlace(id);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType !== "touch")
                          setTooltipPlace(null);
                        if (!drag.current) dragged.current = false;
                      }}
                      onFocus={(event) => {
                        if (
                          !dragged.current ||
                          event.currentTarget.matches(":focus-visible")
                        )
                          setTooltipPlace(id);
                      }}
                      onBlur={() => setTooltipPlace(null)}
                      onClick={() => {
                        if (!dragged.current) setTooltipPlace(id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setTooltipPlace(null);
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setTooltipPlace(id);
                        }
                      }}
                    />
                    {showEndpoints && (id === first || id === last) && (
                      <text
                        className="endpoint-label"
                        style={{ strokeWidth: 3 / pixelScale }}
                        x={p[0]}
                        y={p[1] + 20 / pixelScale}
                        fontSize={11 / pixelScale}
                        textAnchor="middle"
                      >
                        {id === first && id === last
                          ? "Start / Finish"
                          : id === first
                            ? "Start"
                            : "Finish"}
                      </text>
                    )}
                  </g>
                );
              })}
              {pointLabels.map((l) => (
                <g key={l.id}>
                  {Math.hypot(
                    l.position[0] - geometry.points[l.id][0],
                    l.position[1] - geometry.points[l.id][1],
                  ) *
                    pixelScale >
                    32 && (
                    <line
                      pointerEvents="none"
                      x1={geometry.points[l.id][0]}
                      y1={geometry.points[l.id][1]}
                      x2={l.position[0] + 5 / pixelScale}
                      y2={l.position[1] + 7 / pixelScale}
                      stroke="var(--transit)"
                      strokeWidth={0.5 / pixelScale}
                      opacity={0.4}
                    />
                  )}
                  <text
                    className={`place-label${l.transfer ? " transfer-label" : ""}`}
                    style={{ strokeWidth: 3 / pixelScale }}
                    key={l.id}
                    x={l.position[0]}
                    y={l.position[1] + 12 / pixelScale}
                    fontSize={12 / pixelScale}
                  >
                    {numbered
                      ? groups.findIndex((g) => g.members.includes(l.id)) + 1
                      : l.name}
                  </text>
                </g>
              ))}
            </g>
          </svg>
          <Traveler
            model={model}
            clock={clock}
            geometry={geometry}
            view={view}
            frameSize={frameSize}
            frameScale={frameScale}
            status={status}
          />
          {tooltipPlace &&
            geometry.points[tooltipPlace] &&
            (() => {
              const [x, y] = screen(geometry.points[tooltipPlace]);
              const offsetX = (frameSize.width - 900 * frameScale) / 2;
              const offsetY = (frameSize.height - 480 * frameScale) / 2;
              if (
                x + offsetX < 0 ||
                x + offsetX > frameSize.width ||
                y + offsetY < 0 ||
                y + offsetY > frameSize.height
              )
                return null;
              return (
                <MapPlaceTooltip
                  text={name(model, tooltipPlace)}
                  x={x + offsetX}
                  y={y + offsetY}
                  width={frameSize.width}
                  height={frameSize.height}
                />
              );
            })()}
        </div>
        <div className="map-source">
          {durationLabelCandidates > connectionLabels.length && (
            <span className="omitted-durations">
              {durationLabelCandidates - connectionLabels.length} more duration
              labels · zoom, pan or select an area ·{" "}
            </span>
          )}

          {!Object.keys(geometry.points).length && (
            <span>
              No coordinates for visited places
              {country
                ? ` in ${mapAreas(model).find((area) => area.country === country)?.name ?? country}`
                : ""}
              {" · "}
            </span>
          )}
          <a
            href="https://www.naturalearthdata.com/"
            target="_blank"
            rel="noreferrer"
          >
            Map data: Natural Earth
          </a>
        </div>
      </div>
      <div className="legend">
        {groups.map((g, i) => (
          <span
            key={g.key}
            className={
              g.members.every((id) => transfers.has(id))
                ? "transfer-legend"
                : undefined
            }
          >
            <i style={{ background: g.color }} />
            <b>{i + 1}.</b>
            {g.name}
          </span>
        ))}
      </div>
    </>
  );
}
function Calendar({
  model,
  selectedDay,
  selectDay,
  country,
  folder,
}: {
  model: Itinerary;
  selectedDay: number;
  selectDay: (n: number) => void;
  country: string;
  folder: string;
}) {
  const compact = useCompactScreen();
  const slots = useMemo(
    () => scopedCalendarSlots(model, country),
    [model, country],
  );
  const selectedSlot = slots.findIndex(
    (slot) => slot.inScope && slot.day?.index === selectedDay,
  );
  const segmentStart = Math.max(
    0,
    slots.findLastIndex(
      (slot, index) => index <= selectedSlot && slot.gapBefore,
    ),
  );
  const selectedRowEnd = slots.findIndex((_, index) => {
    const rowEnd =
      (index - segmentStart) % 2 === 1 ||
      index === slots.length - 1 ||
      slots[index + 1].gapBefore;
    return selectedSlot >= 0 && index >= selectedSlot && rowEnd;
  });
  const scroller = useRef<HTMLDivElement>(null);
  const selectedCell = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const container = scroller.current,
      cell = selectedCell.current;
    if (!container || !cell) return;
    const bounds = container.getBoundingClientRect(),
      selected = cell.getBoundingClientRect();
    const delta =
      selected.top < bounds.top
        ? selected.top - bounds.top - 8
        : selected.bottom > bounds.bottom
          ? selected.bottom - bounds.bottom + 8
          : 0;
    if (delta)
      container.scrollTo({
        top: container.scrollTop + delta,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [selectedDay, country]);
  return (
    <div className="calendar" ref={scroller}>
      <div className="month-heading">
        <h2>
          {model.trip.startDate
            ? `${slots.find((slot) => slot.inScope)?.date ? dateLabel(slots.find((slot) => slot.inScope)!.date!) : ""} – ${slots.findLast((slot) => slot.inScope)?.date ? dateLabel(slots.findLast((slot) => slot.inScope)!.date!) : ""}`
            : "Days ahead"}
        </h2>
      </div>
      <div className="week">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {slots.map(({ day, date, inScope, gapBefore }, i) => (
          <Fragment key={date ?? day?.index ?? i}>
            {gapBefore && (
              <div className="calendar-gap">
                Later visit ·{" "}
                {date
                  ? dateLabel(date, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : `Day ${day!.index + 1}`}
              </div>
            )}
            {day && inScope ? (
              <button
                key={i}
                className="calendar-day"
                ref={day.index === selectedDay ? selectedCell : undefined}
                data-day={day.index + 1}
                aria-pressed={day.index === selectedDay}
                onClick={() => selectDay(day.index)}
                aria-label={`${dayLabel(day)}. ${calendarCountries(model, day)}. ${dayTitle(model, day)}. ${dayGroups(
                  model,
                  day,
                )
                  .map((group) => group.name + ". ")
                  .join("")}Night: ${name(model, day.overnight)}`}
              >
                <span className="calendar-date-context">
                  <span className="day-date">
                    {day.date
                      ? dateLabel(day.date, { day: "numeric", month: "short" })
                      : `Day ${day.index + 1}`}
                  </span>
                  {calendarCountries(model, day) && (
                    <span className="calendar-country">
                      {calendarCountries(model, day)}
                    </span>
                  )}
                </span>
                {day.source.title && (
                  <span className="day-title">{day.source.title}</span>
                )}
                <GroupLabels model={model} day={day} />
                <span className="cell-chips">
                  {activeLegs(model, day).map((l) => (
                    <LegChip key={l.id} leg={l} />
                  ))}
                </span>
                <span className="night">
                  <Icon kind="bed" />
                  {day.inTransit ? "In transit" : name(model, day.overnight)}
                </span>
                <Bands model={model} day={day} />
              </button>
            ) : (
              <div
                className="empty-day"
                aria-label={`${date ? dateLabel(date, { day: "numeric", month: "long", weekday: "long" }) : `Day ${day!.index + 1}`}, ${day ? "outside selected area" : "outside itinerary"}`}
              >
                <span className="day-date">
                  {date
                    ? dateLabel(date, { day: "numeric", month: "short" })
                    : `Day ${day!.index + 1}`}
                </span>
              </div>
            )}
            {compact && i === selectedRowEnd && (
              <div className="inline-day-details">
                <DayDetails
                  model={model}
                  day={model.days[selectedDay]}
                  folder={folder}
                />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
function GroupLabels({ model, day }: { model: Itinerary; day: NormalizedDay }) {
  return (
    <span className="day-groups">
      {dayGroups(model, day).map((group) => (
        <span className="day-group" key={group.id}>
          <i style={{ background: group.color }} />
          {group.name}
        </span>
      ))}
    </span>
  );
}
function Documents({
  documents,
  folder,
}: {
  documents?: DocumentLink[];
  folder: string;
}) {
  return documents?.length ? (
    <div className="documents">
      {documents.map((d, i) => (
        <a
          key={i}
          href={documentUrl(folder, d.path)}
          target="_blank"
          rel="noreferrer"
        >
          <Icon kind="link" /> {d.label}
        </a>
      ))}
    </div>
  ) : null;
}
function DayDetails({
  model,
  day,
  folder,
}: {
  model: Itinerary;
  day: NormalizedDay;
  folder: string;
}) {
  const legs = activeLegs(model, day);
  return (
    <section className="details" aria-label="Selected day">
      <p className="selected-date">
        {dayLabel(day)} · Day {day.index + 1} of {model.days.length}
      </p>
      <h2>{dayTitle(model, day)}</h2>
      <GroupLabels model={model} day={day} />
      <div className="day-chips">
        {legs.map((l) => (
          <LegChip key={l.id} leg={l} />
        ))}
      </div>
      <span className="night">
        <Icon kind="bed" />
        {day.inTransit
          ? "Night in transit"
          : `Night: ${name(model, day.overnight)}`}
      </span>
      <Bands model={model} day={day} />
      <details key={day.index}>
        <summary>Day details · notes & documents</summary>
        {legs.map((l) => (
          <details className="leg-detail" key={l.id}>
            <summary>
              {name(model, l.from)} → {name(model, l.to)} ·{" "}
              {l.block.mode ?? "Travel"} {legDuration(l)}
            </summary>
            {(l.block.start || l.block.end) && (
              <p>
                {l.block.start && `Departs ${l.block.start}`}{" "}
                {l.block.end && `· arrives ${l.block.end}`}
                {l.endDay > l.day ? ` · Day ${l.endDay}` : ""}
                {l.block.start &&
                l.block.end &&
                model.trip.places[l.from ?? ""]?.timezone !==
                  model.trip.places[l.to]?.timezone
                  ? ` · ${model.trip.places[l.from ?? ""]?.timezone ?? model.trip.timezone} → ${model.trip.places[l.to]?.timezone ?? model.trip.timezone}`
                  : ""}
              </p>
            )}
            {l.block.notes && <p>{l.block.notes}</p>}
            <Documents documents={l.block.documents} folder={folder} />
          </details>
        ))}
        {day.source.notes && <p className="day-note">{day.source.notes}</p>}
        <Documents documents={day.source.documents} folder={folder} />
      </details>
    </section>
  );
}
function App() {
  const [entries, setEntries] = useState<Entry[]>([]),
    [selected, setSelected] = useState(""),
    [itinerary, setItinerary] = useState<Itinerary>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [value, setSemanticValue] = useState(0),
    [tab, setTab] = useState<"overview" | "map" | "calendar">(() => {
      try {
        const saved = window.localStorage.getItem("trip-atlas-view");
        if (saved === "overview" || saved === "map" || saved === "calendar")
          return saved;
      } catch {
        /* Use Overview without storage. */
      }
      return "overview";
    });
  const carriedCountry = useRef("");
  const [playing, setPlaying] = useState(false);
  const [country, setCountry] = useState("");
  const days = useMemo(
    () => (itinerary ? areaDays(itinerary, country) : []),
    [itinerary, country],
  );
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    try {
      const saved = Number(
        window.localStorage.getItem("trip-atlas-playback-speed"),
      );
      if (playbackSpeeds.includes(saved)) return saved;
    } catch {
      // Playback still works when browser storage is unavailable.
    }
    return 1;
  });
  function changePlaybackSpeed(speed: number) {
    if (!playbackSpeeds.includes(speed)) return;
    setPlaybackSpeed(speed);
    try {
      window.localStorage.setItem("trip-atlas-playback-speed", String(speed));
    } catch {
      // The speed change applies to this session even without storage.
    }
  }
  const clock = useMemo(() => createPlayhead(), []);
  const playhead = useRef(0);
  const semanticKey = useRef("");
  const setValue = useCallback(
    (next: number) => {
      clock.set(next);
      const moments = itinerary
        ? [momentAt(itinerary, next), mapMomentAt(itinerary, next)]
        : [];
      const key = JSON.stringify([
        Math.floor(next),
        next >= (itinerary?.days.length ?? 0) - 0.01,
        ...moments.map((moment) => [
          moment.place,
          moment.leg?.id,
          "schematic" in moment ? moment.schematic : false,
        ]),
      ]);
      if (key !== semanticKey.current) {
        semanticKey.current = key;
        setSemanticValue(next);
      }
    },
    [clock, itinerary],
  );
  useEffect(() => {
    if (!playing || !itinerary) return;
    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const next = advancePlayback(
        days,
        playhead.current,
        now - previous,
        playbackSpeed,
      );
      previous = now;
      playhead.current = next.value;
      setValue(next.value);
      if (next.atEnd) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [playing, itinerary, days, playbackSpeed, setValue]);
  function selectPosition(next: number) {
    setPlaying(false);
    playhead.current = next;
    setValue(next);
  }
  function togglePlayback() {
    if (!itinerary) return;
    if (scopedPosition(days, playhead.current) >= days.length - 0.01) {
      playhead.current = days[0].index;
      setValue(playhead.current);
    }
    setPlaying((current) => !current);
  }
  function changeArea(next: string) {
    if (!itinerary) return;
    const eligible = areaDays(itinerary, next);
    setPlaying(false);
    setCountry(next);
    try {
      window.localStorage.setItem(`trip-atlas-area:${selected}`, next);
    } catch {
      // The selection still applies for this session.
    }
    if (!eligible.some((day) => day.index === Math.floor(playhead.current))) {
      selectPosition(eligible[0].index);
    }
  }
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = window.localStorage.getItem("trip-atlas-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // Use the system preference if browser storage is unavailable.
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      window.localStorage.setItem("trip-atlas-theme", next);
    } catch {
      // Switching themes still works when storage is unavailable.
    }
  }
  useEffect(() => {
    let active = true;
    json("/trips/index.json")
      .then((data) => {
        if (
          !Array.isArray(data.trips) ||
          !data.trips.length ||
          !data.trips.every(
            (e: Entry) =>
              e &&
              typeof e.path === "string" &&
              safeRelativePath(e.path) &&
              e.path.includes("/") &&
              typeof e.label === "string",
          )
        )
          throw new Error(
            "/trips/index.json: expected trips with relative folder/trip.json paths and labels",
          );
        if (active) {
          setEntries(data.trips);
          const requested = new URLSearchParams(window.location.search).get(
            "trip",
          );
          setSelected(
            data.trips.find((entry: Entry) => entry.path === requested)?.path ??
              data.trips[0].path,
          );
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e.message));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    json("/trips/" + selected.split("/").map(encodeURIComponent).join("/"))
      .then((data) => {
        const model = normalizeTrip(data);
        if (active) {
          let savedCountry = "";
          try {
            const saved = window.localStorage.getItem(
              `trip-atlas-area:${selected}`,
            );
            const requestedCountry =
              saved === null ? carriedCountry.current : saved;
            if (
              requestedCountry &&
              mapAreas(model).some((area) => area.country === requestedCountry)
            )
              savedCountry = requestedCountry;
          } catch {
            // Open the whole trip when browser storage is unavailable.
          }
          const initialPosition = areaDays(model, savedCountry)[0]?.index ?? 0;
          setItinerary(model);
          setCountry(savedCountry);
          playhead.current = initialPosition;
          clock.set(initialPosition);
          semanticKey.current = "";
          setSemanticValue(initialPosition);
          setPlaying(false);
        }
      })
      .catch((e) => {
        if (active) setError(`${selected}: ${e.message}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, clock]);
  const dayIndex = itinerary
    ? Math.min(itinerary.days.length - 1, Math.floor(value))
    : 0;
  const scopeIndex = days.findIndex((day) => day.index === dayIndex);
  const day = itinerary?.days[dayIndex],
    moment = itinerary ? momentAt(itinerary, value) : undefined;
  const status =
    itinerary && moment
      ? moment.leg
        ? `${name(itinerary, moment.leg.from)} → ${name(itinerary, moment.leg.to)}`
        : moment.place
          ? `In ${name(itinerary, moment.place)}`
          : day
            ? `${name(itinerary, day.startPlace)} → ${name(itinerary, day.overnight ?? activeLegs(itinerary, day).at(-1)?.to)}`
            : "Route"
      : "";
  return (
    <main
      className={`app-shell ${tab === "overview" ? "overview-shell" : ""}`}
      data-theme={theme}
      style={{ colorScheme: theme } as CSSProperties}
    >
      <header className="top">
        <div className="heading">
          <div>
            <p className="kicker">ATLAS / YOUR JOURNEY</p>
            <h1 title={itinerary?.trip.title}>
              {itinerary?.trip.title ?? "Trip Atlas"}
            </h1>
            <p className="meta">
              {itinerary
                ? `${itinerary.trip.startDate ? `${dayLabel(itinerary.days[0])} – ${dateLabel(itinerary.days.at(-1)!.date!, { day: "numeric", month: "long", year: "numeric" })}` : "Dates open"}${tab === "overview" ? "" : ` · ${itinerary.days.length} days · ${visualGroups(itinerary).length} destinations`}`
                : "A little perspective, before you go."}
            </p>
          </div>
          <div className="header-tools">
            {entries.length > 1 && (
              <div className="picker">
                Journey
                <ThemedSelect
                  label="Journey"
                  value={selected}
                  disabled={!entries.length}
                  options={entries.map((entry) => ({
                    value: entry.path,
                    label:
                      entry.title ||
                      (entry.path === selected
                        ? itinerary?.trip.title
                        : undefined) ||
                      entry.label,
                    description: entry.label,
                  }))}
                  onChange={(path) => {
                    carriedCountry.current = country;
                    setPlaying(false);
                    setLoading(true);
                    setError("");
                    setItinerary(undefined);
                    setSelected(path);
                    const url = new URL(window.location.href);
                    url.searchParams.set("trip", path);
                    window.history.replaceState(null, "", url);
                  }}
                />
              </div>
            )}
            <button
              className="theme-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={toggleTheme}
            >
              <Icon kind={theme === "light" ? "moon" : "sun"} />
            </button>
          </div>
        </div>
        <div className="view-toolbar">
          {itinerary && (
            <div className="global-area">
              <span>Area</span>
              <ThemedSelect
                label="Trip area"
                value={country}
                options={[
                  { value: "", label: "Whole trip" },
                  ...mapAreas(itinerary).map((area) => ({
                    value: area.country,
                    label: area.name,
                  })),
                ]}
                onChange={changeArea}
              />
            </div>
          )}
          <nav aria-label="Trip view">
            {(["overview", "map", "calendar"] as const).map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                className={tab === t ? "tab active" : "tab"}
                onClick={() => {
                  setPlaying(false);
                  setTab(t);
                  try {
                    window.localStorage.setItem("trip-atlas-view", t);
                  } catch {
                    /* Keep the session selection. */
                  }
                }}
              >
                <Icon kind={t} />
                {t === "overview"
                  ? "Overview"
                  : t === "map"
                    ? "Map"
                    : "Calendar"}
              </button>
            ))}
          </nav>
        </div>
      </header>
      {loading ? (
        <div className="message" role="status">
          Opening your itinerary…
        </div>
      ) : error ? (
        <section className="message error" role="alert">
          <h2>Couldn’t open this trip</h2>
          <p>{error}</p>
          <p>Correct the trip file, then refresh to try again.</p>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </section>
      ) : itinerary && day && moment ? (
        <>
          {tab === "overview" && (
            <Overview
              key={`${selected}:${country}`}
              model={itinerary}
              country={country}
            />
          )}
          <div
            className={`view-layout ${tab === "overview" ? "map" : tab}`}
            hidden={tab === "overview"}
          >
            <section aria-label={tab === "map" ? "Map view" : "Calendar view"}>
              <div className="map-view" hidden={tab !== "map"}>
                <TripMap
                  key={selected}
                  model={itinerary}
                  value={value}
                  clock={clock}
                  country={country}
                  status={status}
                  day={day}
                  playing={playing}
                  atEnd={
                    scopedPosition(days, clock.get()) >= days.length - 0.01
                  }
                  togglePlayback={togglePlayback}
                  playbackSpeed={playbackSpeed}
                  changePlaybackSpeed={changePlaybackSpeed}
                />
              </div>
              {tab === "calendar" && (
                <Calendar
                  model={itinerary}
                  selectedDay={dayIndex}
                  country={country}
                  folder={selected.slice(0, selected.lastIndexOf("/"))}
                  selectDay={(n) => {
                    selectPosition(n + (clock.get() % 1));
                  }}
                />
              )}
            </section>
            <DayDetails
              model={itinerary}
              day={day}
              folder={selected.slice(0, selected.lastIndexOf("/"))}
            />
          </div>
          <footer className="scrubber" hidden={tab === "overview"}>
            <div className="time-head">
              <label htmlFor="trip-time">
                {country
                  ? `Move through ${new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country}`
                  : "Move through the trip"}
              </label>
              <TimelineOutput model={itinerary} clock={clock} />
            </div>
            <div className="timeline-scroll">
              <div className="whole-trip">
                <div className="whole-bands">
                  {days.map((d) => (
                    <Bands key={d.index} model={itinerary} day={d} />
                  ))}
                </div>
                <TimelineInput
                  model={itinerary}
                  clock={clock}
                  days={days}
                  selectPosition={selectPosition}
                />
              </div>
              <div className="range-ticks">
                {days.map((d, i) => (
                  <button
                    key={i}
                    aria-label={`Select ${dayLabel(d)}`}
                    aria-pressed={d.index === dayIndex}
                    onClick={() => selectPosition(d.index + 0.5)}
                  >
                    <span>
                      {d.date ? Number(d.date.slice(8)) : d.index + 1}
                    </span>
                    {(i === 0 || d.date?.slice(8) === "01") && (
                      <small>
                        {d.date ? dateLabel(d.date, { month: "short" }) : "Day"}
                      </small>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="day-step">
              <button
                aria-label="Previous day"
                disabled={scopeIndex <= 0}
                onClick={() => selectPosition(days[scopeIndex - 1].index + 0.5)}
              >
                <Icon kind="prev" />
              </button>
              <strong>{dayLabel(day)}</strong>
              <button
                aria-label="Next day"
                disabled={scopeIndex === days.length - 1}
                onClick={() => selectPosition(days[scopeIndex + 1].index + 0.5)}
              >
                <Icon kind="next" />
              </button>
            </div>
            <div className="live-status" aria-live="polite">
              <span>
                {moment.leg ? "In transit · " : ""}
                {status}
              </span>
            </div>
          </footer>
        </>
      ) : null}
    </main>
  );
}
export default App;
