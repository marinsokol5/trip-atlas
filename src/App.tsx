import {
  Map as MapIcon,
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
import { useEffect, useMemo, useState, useRef, Fragment } from "react";
import type { CSSProperties } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import {
  dateAt,
  documentUrl,
  normalizeTrip,
  safeRelativePath,
} from "./itinerary";
import type { Itinerary, NormalizedDay, DocumentLink, Leg } from "./itinerary";
import {
  activeLegs,
  clockAt,
  curvePoint,
  dateLabel,
  dayLabel,
  dayTitle,
  dayGroups,
  duration,
  momentAt,
  componentLegs,
  placeColor,
  visualGroups,
  groupKey,
  modeKind,
  legDuration,
  durationTotals,
  dayBands,
  mapRoute,
  mapPointStyle,
  transferPlaces,
  mapDisplayConnections,
  mapDisplayDuration,
  directedCurvePoint,
  zoomMap,
  mapZoomMin,
  mapZoomMax,
  calendarSlots,
  routeCurve,
} from "./view-model";
import type { Moment, Point, MapDurationFilter } from "./view-model";
import world from "./assets/world.json";
import "./App.css";

type Entry = { path: string; label: string };
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
        {leg.durationMs !== undefined && (
          <span className="leg-chip">{duration(leg.durationMs)} total</span>
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
function TripMap({
  model,
  moment,
  status,
  day,
  playing,
  atEnd,
  togglePlayback,
  playbackSpeed,
  changePlaybackSpeed,
}: {
  model: Itinerary;
  moment: Moment;
  status: string;
  day: NormalizedDay;
  playing: boolean;
  atEnd: boolean;
  togglePlayback: () => void;
  playbackSpeed: number;
  changePlaybackSpeed: (speed: number) => void;
}) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [durationFilter, setDurationFilter] = useState<MapDurationFilter>("60");
  const frame = useRef<HTMLDivElement>(null);
  const [frameScale, setFrameScale] = useState(1);
  const compact = useCompactScreen();
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0)
        setFrameScale(
          Math.min(
            entry.contentRect.width / 900,
            entry.contentRect.height / 480,
          ),
        );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const pixelScale = frameScale * view.k;
  const numbered = frameScale < 0.9;
  const drag = useRef<
    { x: number; y: number; vx: number; vy: number } | undefined
  >(undefined);
  const groups = useMemo(() => visualGroups(model), [model]);
  const transfers = useMemo(() => transferPlaces(model), [model]);
  const connections = useMemo(() => mapDisplayConnections(model), [model]);
  const geometry = useMemo(() => {
    const locations = Object.entries(model.trip.places)
      .filter(([, p]) => p.coordinates)
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
    projection.clipExtent([
      [-5000, -5000],
      [5000, 5000],
    ]);
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
  }, [model, groups, transfers, connections]);
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
  const first = model.legs[0]?.from ?? model.days[0].startPlace;
  const last = model.days.at(-1)?.overnight ?? model.legs.at(-1)?.to;
  for (const [id, point] of Object.entries(geometry.points)) {
    const [x, y] = screen(point),
      radius = transfers.has(id) ? 4 : 8;
    occupied.push({
      x: x - radius,
      y: y - radius,
      width: radius * 2,
      height: radius * 2,
    });
    if (id === first || id === last) {
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
    const selected = [
      ...connection.outbound.legs,
      ...(connection.inbound?.legs ?? []),
    ].some((leg) => leg.day <= day.index + 1 && leg.endDay >= day.index + 1);
    if (!route || (compact && !selected)) return [];
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
    ]);
    return position ? [{ connection, anchor, position, width, text }] : [];
  });
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
  const selected = new Set(activeLegs(model, day).map((l) => l.id));
  const zoom = (factor: number) => setView((view) => zoomMap(view, factor));
  return (
    <>
      <div className="map-canvas" data-testid="map-canvas">
        <div className="map-header">
          <div className="map-caption">
            <span>Along your route</span>
            <strong>{status}</strong>
          </div>
        </div>
        <div className="map-controls">
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
          <label className="map-duration-filter">
            Speed
            <select
              aria-label="Playback speed"
              title="1× advances one itinerary day every three seconds"
              value={playbackSpeed}
              onChange={(e) => changePlaybackSpeed(Number(e.target.value))}
            >
              {playbackSpeeds.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </select>
          </label>
          <label className="map-duration-filter">
            Durations
            <select
              aria-label="Map duration labels"
              value={durationFilter}
              onChange={(e) =>
                setDurationFilter(e.target.value as MapDurationFilter)
              }
            >
              <option value="all">All</option>
              <option value="60">&gt;1h</option>
              <option value="120">&gt;2h</option>
              <option value="none">None</option>
            </select>
          </label>
          <button
            aria-label="Zoom in"
            disabled={view.k >= mapZoomMax}
            onClick={() => zoom(1.5)}
          >
            <Icon kind="plus" />
          </button>
          <button
            aria-label="Zoom out"
            disabled={view.k <= mapZoomMin}
            onClick={() => zoom(1 / 1.5)}
          >
            <Icon kind="minus" />
          </button>
          <button onClick={() => setView({ x: 0, y: 0, k: 1 })}>
            <Icon kind="reset" />
            Show whole trip
          </button>
        </div>
        <div className="map-geometry" ref={frame}>
          <svg
            viewBox="0 0 900 480"
            role="img"
            aria-label={`Trip map. ${status}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                vx: view.x,
                vy: view.y,
              };
            }}
            onPointerMove={(e) => {
              if (drag.current) {
                const scale = 1 / frameScale;
                setView((v) => ({
                  ...v,
                  x: drag.current!.vx + (e.clientX - drag.current!.x) * scale,
                  y: drag.current!.vy + (e.clientY - drag.current!.y) * scale,
                }));
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
              <g className="geography">
                {geometry.shapes.map((s) => (
                  <path key={s.id} d={s.path ?? ""}>
                    <title>{s.name}</title>
                  </path>
                ))}
              </g>
              {geometry.routes.map(({ leg, reverseLeg, curve }) => {
                const internal =
                    groupKey(model, leg.from) === groupKey(model, leg.to),
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
                          title={`${name(model, connection.outbound.from)} ${connection.inbound ? "↔" : "→"} ${name(model, connection.outbound.to)} · ${connection.inbound ? "Longer direction's vehicle time" : "Vehicle time"}`}
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
                    {(id === first || id === last) && (
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
              {marker && (
                <g
                  data-testid="traveler"
                  data-place={moment.place ?? ""}
                  data-leg={moment.leg?.id ?? ""}
                  transform={`translate(${marker})`}
                >
                  <circle r={10 / pixelScale} fill="var(--blue)" opacity=".2" />
                  <circle
                    r={6 / pixelScale}
                    fill="var(--blue)"
                    stroke="var(--paper)"
                    strokeWidth={2 / pixelScale}
                  />
                </g>
              )}
            </g>
          </svg>
        </div>
        <div className="map-source">
          Drag to pan · schematic connections · Natural Earth
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
            {numbered && <b>{i + 1}.</b>}
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
  folder,
}: {
  model: Itinerary;
  selectedDay: number;
  selectDay: (n: number) => void;
  folder: string;
}) {
  const compact = useCompactScreen();
  const slots = model.trip.startDate ? calendarSlots(model) : model.days;
  const offset = slots.findIndex((day) => day !== undefined);
  const selectedSlot = selectedDay + offset;
  return (
    <div className="calendar">
      <div className="month-heading">
        <h2>
          {model.trip.startDate
            ? `${dayLabel(model.days[0])} – ${dayLabel(model.days.at(-1)!)}`
            : "Days ahead"}
        </h2>
        <span>~ approximate duration · bands show route sequence</span>
      </div>
      <div className="week">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {slots.map((day, i) => (
          <Fragment key={i}>
            {day ? (
              <button
                key={i}
                className="calendar-day"
                data-day={day.index + 1}
                aria-pressed={day.index === selectedDay}
                onClick={() => selectDay(day.index)}
                aria-label={`${dayLabel(day)}. ${dayTitle(model, day)}. ${dayGroups(
                  model,
                  day,
                )
                  .map((group) => group.name + ". ")
                  .join("")}Night: ${name(model, day.overnight)}`}
              >
                <span className="day-date">
                  {day.date
                    ? dateLabel(day.date, { day: "numeric", month: "short" })
                    : `Day ${day.index + 1}`}
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
                aria-label={`${dateLabel(dateAt(model.trip.startDate!, i - offset), { day: "numeric", month: "long", weekday: "long" })}, outside itinerary`}
              >
                <span className="day-date">
                  {dateLabel(dateAt(model.trip.startDate!, i - offset), {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            )}
            {compact &&
              (i % 2 === 1 || i === slots.length - 1) &&
              Math.floor(selectedSlot / 2) === Math.floor(i / 2) && (
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
      <small className="timing-note">
        {day.hasUnknownTiming
          ? "Schematic sequence · widths estimated, not clock times"
          : "Bands follow entered times"}
      </small>
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
    [value, setValue] = useState(0),
    [tab, setTab] = useState<"map" | "calendar">("map");
  const [playing, setPlaying] = useState(false);
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
  const playhead = useRef(value);
  useEffect(() => {
    playhead.current = value;
  }, [value]);
  useEffect(() => {
    if (!playing || !itinerary) return;
    let frame = 0;
    let previous = performance.now();
    const end = itinerary.days.length - 0.01;
    const tick = (now: number) => {
      const next = Math.min(
        end,
        playhead.current +
          (Math.min(now - previous, 250) * playbackSpeed) / 3000,
      );
      previous = now;
      playhead.current = next;
      setValue(next);
      if (next >= end) setPlaying(false);
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
  }, [playing, itinerary, playbackSpeed]);
  function selectPosition(next: number) {
    setPlaying(false);
    playhead.current = next;
    setValue(next);
  }
  function togglePlayback() {
    if (!itinerary) return;
    if (value >= itinerary.days.length - 0.01) {
      playhead.current = 0;
      setValue(0);
    }
    setPlaying((current) => !current);
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
          setItinerary(model);
          playhead.current = 0;
          setValue(0);
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
  }, [selected]);
  const dayIndex = itinerary
    ? Math.min(itinerary.days.length - 1, Math.floor(value))
    : 0;
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
  const time =
    itinerary && moment
      ? moment.leg
        ? `${clockAt(itinerary, moment.at, moment.leg.from)} → ${clockAt(itinerary, moment.at, moment.leg.to)}`
        : clockAt(itinerary, moment.at, moment.place)
      : undefined;
  const readout = day ? `${dayLabel(day)} · ${time ?? "Planned day"}` : "";
  return (
    <main
      className="app-shell"
      data-theme={theme}
      style={{ colorScheme: theme } as CSSProperties}
    >
      <header className="top">
        <div className="heading">
          <div>
            <p className="kicker">ATLAS / YOUR JOURNEY</p>
            <h1>{itinerary?.trip.title ?? "Trip Atlas"}</h1>
            <p className="meta">
              {itinerary
                ? `${itinerary.trip.startDate ? `${dayLabel(itinerary.days[0])} – ${dateLabel(itinerary.days.at(-1)!.date!, { day: "numeric", month: "long", year: "numeric" })}` : "Dates open"} · ${itinerary.days.length} days · ${visualGroups(itinerary).length} destinations`
                : "A little perspective, before you go."}
            </p>
          </div>
          <div className="header-tools">
            <label className="picker">
              Journey
              <select
                aria-label="Journey"
                value={selected}
                disabled={!entries.length}
                onChange={(e) => {
                  setPlaying(false);
                  setLoading(true);
                  setError("");
                  setItinerary(undefined);
                  setSelected(e.target.value);
                  const url = new URL(window.location.href);
                  url.searchParams.set("trip", e.target.value);
                  window.history.replaceState(null, "", url);
                }}
              >
                {entries.map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="theme-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={toggleTheme}
            >
              <Icon kind={theme === "light" ? "moon" : "sun"} />
            </button>
          </div>
        </div>
        <nav aria-label="Trip view">
          {(["map", "calendar"] as const).map((t) => (
            <button
              key={t}
              aria-pressed={tab === t}
              className={tab === t ? "tab active" : "tab"}
              onClick={() => {
                setPlaying(false);
                setTab(t);
              }}
            >
              <Icon kind={t} />
              {t === "map" ? "Map" : "Calendar"}
            </button>
          ))}
        </nav>
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
          <div className={`view-layout ${tab}`}>
            <section aria-label={tab === "map" ? "Map view" : "Calendar view"}>
              <div className="map-view" hidden={tab !== "map"}>
                <TripMap
                  key={selected}
                  model={itinerary}
                  moment={moment}
                  status={status}
                  day={day}
                  playing={playing}
                  atEnd={value >= itinerary.days.length - 0.01}
                  togglePlayback={togglePlayback}
                  playbackSpeed={playbackSpeed}
                  changePlaybackSpeed={changePlaybackSpeed}
                />
              </div>
              {tab === "calendar" && (
                <Calendar
                  model={itinerary}
                  selectedDay={dayIndex}
                  folder={selected.slice(0, selected.lastIndexOf("/"))}
                  selectDay={(n) => selectPosition(n + (value % 1))}
                />
              )}
            </section>
            <DayDetails
              model={itinerary}
              day={day}
              folder={selected.slice(0, selected.lastIndexOf("/"))}
            />
          </div>
          <div className="totals">
            {durationTotals(itinerary)
              .filter((t) => t.count)
              .map((t) => (
                <span key={t.category}>
                  {t.category === "mixed" ? "mixed / unallocated" : t.category}:{" "}
                  {t.knownMs ? `${duration(t.knownMs)} entered` : ""}
                  {t.knownMs && t.estimatedMs ? " + " : ""}
                  {t.estimatedMs
                    ? `~${duration(t.estimatedMs)} estimated`
                    : ""}{" "}
                  · {t.covered}/{t.count} sections with duration
                </span>
              ))}
          </div>
          <footer className="scrubber">
            <div className="time-head">
              <label htmlFor="trip-time">Move through the trip</label>
              <output htmlFor="trip-time">{readout}</output>
            </div>
            <div className="timeline-scroll">
              <div className="whole-trip">
                <div className="whole-bands">
                  {itinerary.days.map((d) => (
                    <Bands key={d.index} model={itinerary} day={d} />
                  ))}
                </div>
                <input
                  id="trip-time"
                  aria-label="Trip timeline"
                  aria-valuetext={`${readout}. ${status}`}
                  type="range"
                  min="0"
                  max={itinerary.days.length - 0.01}
                  step="0.01"
                  value={value}
                  onChange={(e) => selectPosition(Number(e.target.value))}
                />
              </div>
              <div className="range-ticks">
                {itinerary.days.map((d, i) => (
                  <button
                    key={i}
                    aria-label={`Select ${dayLabel(d)}`}
                    aria-pressed={i === dayIndex}
                    onClick={() => selectPosition(i + 0.5)}
                  >
                    <span>{d.date ? Number(d.date.slice(8)) : i + 1}</span>
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
                disabled={dayIndex === 0}
                onClick={() => selectPosition(dayIndex - 0.5)}
              >
                <Icon kind="prev" />
              </button>
              <strong>{dayLabel(day)}</strong>
              <button
                aria-label="Next day"
                disabled={dayIndex === itinerary.days.length - 1}
                onClick={() => selectPosition(dayIndex + 1.5)}
              >
                <Icon kind="next" />
              </button>
            </div>
            <div className="live-status" aria-live="polite">
              <span>
                {moment.leg ? "In transit · " : ""}
                {status}
              </span>
              <span>
                {day.inTransit
                  ? "Night in transit"
                  : `Night: ${name(itinerary, day.overnight)}`}
              </span>
            </div>
          </footer>
        </>
      ) : null}
    </main>
  );
}
export default App;
