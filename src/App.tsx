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
} from "lucide-react";
import { useEffect, useMemo, useState, useRef, Fragment } from "react";
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
  calendarSlots,
  routeCurve,
} from "./view-model";
import type { Moment, Point } from "./view-model";
import world from "./assets/world.json";
import "./App.css";

type Entry = { path: string; label: string };
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
}: {
  model: Itinerary;
  moment: Moment;
  status: string;
  day: NormalizedDay;
}) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const frame = useRef<HTMLDivElement>(null);
  const [frameScale, setFrameScale] = useState(1);
  const compact = useCompactScreen();
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setFrameScale(entry.contentRect.width / 900);
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
    const routes = model.legs
      .filter((l) => l.from && points[l.from] && points[l.to])
      .map((l) => ({
        leg: l,
        curve: routeCurve(points[l.from!], points[l.to]),
      }));
    const path = geoPath(projection);
    const shapes = world.features.map((feature, i) => ({
      id: i,
      path: path(feature as unknown as GeoPermissibleObjects),
      name: feature.properties.name,
    }));
    // Labels use screen-space offsets and collision avoidance, independent of the selected day.
    const placed: { x: number; y: number; width: number }[] = [];
    const labels = groups.map((group) => {
      const id = group.members.find((id) => points[id]);
      if (!id) return undefined;
      const [x, y] = points[id],
        width = (numbered ? 30 : group.name.length * 7 + 12) / frameScale;
      const offsets = [
        [12, -20],
        [12, 25],
        [-width - 12, -20],
        [-width - 12, 25],
        [12, -45],
        [12, 50],
        [-width - 12, -45],
      ];
      const position = offsets
        .map(([dx, dy]) => ({
          x: Math.max(10, Math.min(870 - width, x + dx)),
          y: Math.max(80, Math.min(440, y + dy)),
          width,
        }))
        .find((p) =>
          placed.every(
            (q) =>
              Math.abs(p.y - q.y) > 23 / frameScale ||
              p.x + p.width < q.x ||
              q.x + q.width < p.x,
          ),
        ) ?? { x: x + 12, y: y - 20, width };
      placed.push(position);
      return { id, name: group.name, ...position };
    });
    const routeLabels = new Map<string, Point>();
    for (const { leg, curve } of routes) {
      if (
        groupKey(model, leg.from) === groupKey(model, leg.to) ||
        !legDuration(leg)
      )
        continue;
      const p = curvePoint(curve, 0.5),
        width = 90 / frameScale;
      const choices = [
        [0, -8],
        [0, 20],
        [-90, -8],
        [-90, 20],
        [5, -35],
        [-90, 45],
        ...[-65, 65, -95, 95].flatMap((dy) =>
          [-100, 0, 100].map((dx) => [dx / frameScale, dy / frameScale]),
        ),
      ];
      const candidate = choices
        .map(([dx, dy]) => ({
          x: Math.max(8, Math.min(805, p[0] + dx)),
          y: Math.max(70, Math.min(438, p[1] + dy)),
          width,
        }))
        .find((p) =>
          placed.every(
            (q) =>
              Math.abs(p.y - q.y) > 26 / frameScale ||
              p.x + p.width < q.x ||
              q.x + q.width < p.x,
          ),
        );
      if (candidate) {
        placed.push(candidate);
        routeLabels.set(leg.id, [candidate.x, candidate.y]);
      }
    }
    return {
      points,
      routes,
      shapes,
      labels: labels.filter((l) => l !== undefined),
      routeLabels,
    };
  }, [model, groups, frameScale, numbered]);
  const numberedPositions = new Map<string, Point>();
  const occupied: Point[] = [];
  for (const label of geometry.labels) {
    const point = geometry.points[label.id];
    const options = [
      [10, -12],
      [10, 18],
      [-22, -12],
      [-22, 18],
      [12, -32],
      [12, 38],
      [-22, -32],
      [-22, 38],
    ];
    const chosen =
      options
        .map(
          ([x, y]) =>
            [point[0] + x / pixelScale, point[1] + y / pixelScale] as Point,
        )
        .find((p) =>
          occupied.every(
            (q) => Math.hypot(p[0] - q[0], p[1] - q[1]) * pixelScale > 21,
          ),
        ) ?? point;
    occupied.push(chosen);
    numberedPositions.set(label.id, chosen);
  }
  const active = geometry.routes.find((r) => r.leg.id === moment.leg?.id);
  const marker =
    moment.leg && active && moment.progress !== undefined
      ? curvePoint(active.curve, moment.progress)
      : moment.place
        ? geometry.points[moment.place]
        : undefined;
  const selected = new Set(activeLegs(model, day).map((l) => l.id));
  const first = model.legs[0]?.from ?? model.days[0].startPlace;
  const last = model.days.at(-1)?.overnight ?? model.legs.at(-1)?.to;
  const zoom = (factor: number) =>
    setView((v) => {
      const k = Math.max(1, Math.min(12, v.k * factor));
      return {
        k,
        x: 450 - ((450 - v.x) * k) / v.k,
        y: 240 - ((240 - v.y) * k) / v.k,
      };
    });
  return (
    <>
      <div className="map-canvas" data-testid="map-canvas">
        <div className="map-header">
          <div className="map-caption">
            <span>Along your route</span>
            <strong>{status}</strong>
          </div>
          {compact && (
            <div className="map-mobile-connections">
              {activeLegs(model, day)
                .filter(
                  (l) => groupKey(model, l.from) !== groupKey(model, l.to),
                )
                .map((l) => (
                  <span
                    key={l.id}
                    title={`${name(model, l.from)} → ${name(model, l.to)}`}
                  >
                    <span>
                      {groups.findIndex((g) =>
                        g.members.includes(l.from ?? ""),
                      ) + 1}{" "}
                      → {groups.findIndex((g) => g.members.includes(l.to)) + 1}
                    </span>
                    <LegChip leg={l} />
                  </span>
                ))}
            </div>
          )}
        </div>
        <div className="map-controls">
          <button aria-label="Zoom in" onClick={() => zoom(1.5)}>
            <Icon kind="plus" />
          </button>
          <button aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}>
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
                const scale =
                  900 / e.currentTarget.getBoundingClientRect().width;
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
                  markerWidth={7 / pixelScale}
                  markerHeight={7 / pixelScale}
                  markerUnits="userSpaceOnUse"
                  orient="auto"
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
              {geometry.routes.map(({ leg, curve }) => {
                const internal =
                    groupKey(model, leg.from) === groupKey(model, leg.to),
                  isActive = selected.has(leg.id);
                const { curve: c, arrow } = mapRoute(
                  curve,
                  internal,
                  pixelScale,
                );
                const midpoint = geometry.routeLabels.get(leg.id);
                return (
                  <g key={leg.id}>
                    <path
                      data-leg={leg.id}
                      className={`route${isActive ? " active" : ""}`}
                      style={{
                        stroke: internal ? color(model, leg.to) : undefined,
                        strokeWidth: (isActive ? 3 : 1.6) / pixelScale,
                      }}
                      d={`M${c.a}Q${c.c} ${c.b}`}
                      markerEnd={
                        arrow
                          ? `url(#${isActive ? "active" : "route"}-arrow)`
                          : undefined
                      }
                    >
                      <title>
                        {name(model, leg.from)} → {name(model, leg.to)}
                      </title>
                    </path>
                    {!internal && midpoint && (!compact || isActive) && (
                      <>
                        <line
                          x1={curvePoint(curve, 0.5)[0]}
                          y1={curvePoint(curve, 0.5)[1]}
                          x2={
                            curvePoint(curve, 0.5)[0] +
                            (midpoint[0] -
                              curvePoint(curve, 0.5)[0] +
                              25 / frameScale) /
                              view.k
                          }
                          y2={
                            curvePoint(curve, 0.5)[1] +
                            (midpoint[1] -
                              curvePoint(curve, 0.5)[1] +
                              8 / frameScale) /
                              view.k
                          }
                          stroke="var(--transit)"
                          strokeWidth={0.6 / pixelScale}
                          opacity={0.5}
                        />
                        <foreignObject
                          className="route-label"
                          x={
                            curvePoint(curve, 0.5)[0] +
                            (midpoint[0] - curvePoint(curve, 0.5)[0]) / view.k
                          }
                          y={
                            curvePoint(curve, 0.5)[1] +
                            (midpoint[1] - curvePoint(curve, 0.5)[1]) / view.k
                          }
                          width={100 / pixelScale}
                          height={26 / pixelScale}
                          overflow="visible"
                        >
                          <div
                            style={{
                              transform: `scale(${1 / pixelScale})`,
                              transformOrigin: "top left",
                            }}
                          >
                            <LegChip leg={leg} />
                          </div>
                        </foreignObject>
                      </>
                    )}
                  </g>
                );
              })}
              {Object.entries(geometry.points).map(([id, p]) => (
                <g key={id}>
                  <circle
                    cx={p[0]}
                    cy={p[1]}
                    r={
                      (activeLegs(model, day).some(
                        (l) => l.from === id || l.to === id,
                      )
                        ? 7
                        : 5) / pixelScale
                    }
                    fill={color(model, id)}
                    stroke="var(--paper)"
                    strokeWidth={2 / pixelScale}
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
              ))}
              {geometry.labels.map((l) => (
                <text
                  className="place-label"
                  style={{ strokeWidth: 3 / pixelScale }}
                  key={l.id}
                  x={
                    numbered
                      ? numberedPositions.get(l.id)![0]
                      : geometry.points[l.id][0] +
                        (l.x - geometry.points[l.id][0]) / view.k
                  }
                  y={
                    numbered
                      ? numberedPositions.get(l.id)![1]
                      : geometry.points[l.id][1] +
                        (l.y - geometry.points[l.id][1]) / view.k
                  }
                  fontSize={12 / pixelScale}
                >
                  {numbered
                    ? groups.findIndex((g) => g.members.includes(l.id)) + 1
                    : l.name}
                </text>
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
          <span key={g.key}>
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
        {(compact ? model.days : calendarSlots(model)).map((day, i) =>
          day ? (
            <Fragment key={i}>
              <button
                key={i}
                className="calendar-day"
                data-day={day.index + 1}
                aria-pressed={day.index === selectedDay}
                onClick={() => selectDay(day.index)}
                aria-label={`${dayLabel(day)}. Night: ${name(model, day.overnight)}`}
              >
                <span className="day-date">
                  {day.date
                    ? dateLabel(day.date, { day: "numeric", month: "short" })
                    : `Day ${day.index + 1}`}
                </span>
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
              {compact &&
                (i % 2 === 1 || i === model.days.length - 1) &&
                Math.floor(selectedDay / 2) === Math.floor(i / 2) && (
                  <div className="inline-day-details">
                    <DayDetails
                      model={model}
                      day={model.days[selectedDay]}
                      folder={folder}
                    />
                  </div>
                )}
            </Fragment>
          ) : (
            <div key={i} className="empty-day" />
          ),
        )}
      </div>
    </div>
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
      <h2>
        {legs.length
          ? `${name(model, legs[0].from)} → ${name(model, legs.at(-1)!.to)}`
          : name(model, day.overnight)}
      </h2>
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
    [value, setValue] = useState(0.5),
    [tab, setTab] = useState<"map" | "calendar">("map");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
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
          setValue(0.5);
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
    <main data-theme={theme} style={{ colorScheme: theme } as CSSProperties}>
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
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
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
              onClick={() => setTab(t)}
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
              <div hidden={tab !== "map"}>
                <TripMap
                  key={selected}
                  model={itinerary}
                  moment={moment}
                  status={status}
                  day={day}
                />
              </div>
              {tab === "calendar" && (
                <Calendar
                  model={itinerary}
                  selectedDay={dayIndex}
                  folder={selected.slice(0, selected.lastIndexOf("/"))}
                  selectDay={(n) => setValue(n + (value % 1))}
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
                  onChange={(e) => setValue(Number(e.target.value))}
                />
              </div>
              <div className="range-ticks">
                {itinerary.days.map((d, i) => (
                  <button
                    key={i}
                    aria-label={`Select ${dayLabel(d)}`}
                    aria-pressed={i === dayIndex}
                    onClick={() => setValue(i + 0.5)}
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
                onClick={() => setValue(dayIndex - 0.5)}
              >
                <Icon kind="prev" />
              </button>
              <strong>{dayLabel(day)}</strong>
              <button
                aria-label="Next day"
                disabled={dayIndex === itinerary.days.length - 1}
                onClick={() => setValue(dayIndex + 1.5)}
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
