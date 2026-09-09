import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { documentUrl, normalizeTrip, safeRelativePath } from "./itinerary";
import type { Itinerary, NormalizedDay, DocumentLink } from "./itinerary";
import {
  activeLegs,
  clockAt,
  curvePoint,
  dateLabel,
  dayLabel,
  duration,
  momentAt,
  palette,
  routeCurve,
} from "./view-model";
import type { Moment, Point } from "./view-model";
import world from "./assets/world.json";
import "./App.css";

type Entry = { path: string; label: string };
const name = (model: Itinerary, id?: string) =>
  id ? (model.trip.places[id].name ?? id) : "Location open";
const color = (model: Itinerary, id?: string) =>
  id
    ? palette[Object.keys(model.trip.places).indexOf(id) % palette.length]
    : "var(--transit)";
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
function Icon({ kind }: { kind: "map" | "calendar" | "bed" | "sun" | "moon" }) {
  const paths = {
    map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16",
    calendar: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2",
    bed: "M3 18V8m18 10V8M3 15h18M5 8h14v7M8 8V5h8v3",
    sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    moon: "M20 15.4A9 9 0 0 1 8.6 4 9 9 0 1 0 20 15.4",
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
function Bands({ model, day }: { model: Itinerary; day: NormalizedDay }) {
  const timelessStay =
    day.hasUnknownTiming &&
    !day.source.blocks?.some((b) => b.type === "place") &&
    day.segments.length === 1 &&
    day.segments[0].type === "stay";
  return (
    <div
      className={`bands ${day.hasUnknownTiming && !timelessStay ? "unknown-band" : ""}`}
      aria-label={
        day.hasUnknownTiming
          ? timelessStay
            ? `Stay in ${name(model, day.overnight)}`
            : "Timing unknown; no elapsed proportions"
          : `${duration(day.durationMs!)} elapsed day`
      }
    >
      {(!day.hasUnknownTiming || timelessStay) &&
        day.segments.map((segment, i) => (
          <span
            key={i}
            className={
              segment.type === "travel"
                ? "transit-band"
                : segment.type === "unknown"
                  ? "unknown-band"
                  : ""
            }
            style={{
              flex: day.durationMs ? segment.durationMs! / day.durationMs : 1,
              backgroundColor: color(model, segment.place),
            }}
            title={`${segment.type === "stay" ? name(model, segment.place) : segment.type === "travel" ? "Transit" : "Location open"}${segment.durationMs !== undefined ? ` · ${duration(segment.durationMs)}` : ""}`}
          />
        ))}
    </div>
  );
}
function TripMap({
  model,
  moment,
  status,
}: {
  model: Itinerary;
  moment: Moment;
  status: string;
}) {
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
      [-1000, 0],
      [1900, 480],
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
    const labels = locations.map(({ id }) => {
      const [x, y] = points[id],
        width = name(model, id).length * 7 + 12;
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
          x: Math.max(10, Math.min(890 - width, x + dx)),
          y: Math.max(80, Math.min(440, y + dy)),
          width,
        }))
        .find((p) =>
          placed.every(
            (q) =>
              Math.abs(p.y - q.y) > 21 ||
              p.x + p.width < q.x ||
              q.x + q.width < p.x,
          ),
        ) ?? { x: x + 12, y: y - 20, width };
      placed.push(position);
      return { id, ...position };
    });
    return { points, routes, shapes, labels };
  }, [model]);
  const active = geometry.routes.find((r) => r.leg.id === moment.leg?.id);
  const marker = moment.leg
    ? active
      ? curvePoint(active.curve, moment.progress!)
      : undefined
    : moment.place
      ? geometry.points[moment.place]
      : undefined;
  const missing = Object.entries(model.trip.places).filter(
    ([, p]) => !p.coordinates,
  );
  return (
    <>
      <div className="map-canvas" data-testid="map-canvas">
        <div className="map-caption">
          <span>Along your route</span>
          <strong>{status}</strong>
        </div>
        <div className="map-geometry">
          <svg
            viewBox="0 0 900 480"
            role="img"
            aria-label={`Trip map. ${status}`}
          >
            <defs>
              {["route", "active"].map((id) => (
                <marker
                  key={id}
                  id={`${id}-arrow`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path
                    d="M0 0 10 5 0 10Z"
                    fill={`var(--${id === "active" ? "blue" : "transit"})`}
                  />
                </marker>
              ))}
            </defs>
            <g className="geography">
              {geometry.shapes.map((s) => (
                <path key={s.id} d={s.path ?? ""}>
                  <title>{s.name}</title>
                </path>
              ))}
            </g>
            <g className="routes">
              {geometry.routes.map(({ leg, curve: { a, b, c } }) => (
                <path
                  key={leg.id}
                  data-route={leg.id}
                  className={
                    moment.leg?.id === leg.id ? "route active" : "route"
                  }
                  d={`M${a}Q${c} ${b}`}
                  markerEnd={`url(#${moment.leg?.id === leg.id ? "active" : "route"}-arrow)`}
                >
                  <title>
                    {name(model, leg.from)} → {name(model, leg.to)}
                  </title>
                </path>
              ))}
            </g>
            {Object.entries(geometry.points).map(([id, p]) => (
              <g key={id}>
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r="5"
                  fill={color(model, id)}
                  stroke="var(--paper)"
                  strokeWidth="2"
                />
                <text
                  className="point-number"
                  x={p[0]}
                  y={p[1] - 12}
                  textAnchor="middle"
                >
                  {Object.keys(model.trip.places).indexOf(id) + 1}
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
                <circle r="14" fill="var(--blue)" opacity=".18" />
                <circle
                  r="7"
                  fill="var(--blue)"
                  stroke="var(--paper)"
                  strokeWidth="3"
                />
              </g>
            )}
          </svg>
          <div className="map-labels">
            {geometry.labels.map((l) => (
              <span
                key={l.id}
                style={{ left: `${l.x / 9}%`, top: `${l.y / 4.8}%` }}
              >
                {name(model, l.id)}
              </span>
            ))}
          </div>
        </div>
        <div className="map-source">
          Natural Earth · connecting lines, not exact routes
        </div>
      </div>
      <div className="legend">
        {Object.keys(model.trip.places).map((id, i) => (
          <span key={id}>
            <i style={{ background: color(model, id) }} />
            <b className="legend-number">{i + 1}.</b>
            {name(model, id)}
            {!model.trip.places[id].coordinates && <small>unmapped</small>}
          </span>
        ))}
        <span>
          <i className="transit-band" />
          Transit
        </span>
      </div>
      {missing.length > 0 && (
        <p className="unmapped">
          {missing.length === Object.keys(model.trip.places).length
            ? "Add coordinates to place this journey on the map."
            : "Places without coordinates remain in the calendar and day details."}
        </p>
      )}
    </>
  );
}
function Calendar({
  model,
  selectedDay,
  selectDay,
}: {
  model: Itinerary;
  selectedDay: number;
  selectDay: (n: number) => void;
}) {
  const months = [
    ...new Set(model.days.map((d) => d.date?.slice(0, 7) ?? "undated")),
  ];
  return (
    <div className="calendar">
      {months.map((month) => {
        const days = model.days.filter(
          (d) => (d.date?.slice(0, 7) ?? "undated") === month,
        );
        const dated = month !== "undated";
        const offset = dated
          ? (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7
          : 0;
        const total = dated
          ? Math.min(
              new Date(
                Date.UTC(
                  Number(month.slice(0, 4)),
                  Number(month.slice(5, 7)),
                  0,
                ),
              ).getUTCDate(),
              Math.ceil((offset + Number(days.at(-1)!.date!.slice(8))) / 7) *
                7 -
                offset,
            )
          : days.length;
        return (
          <section className="month" key={month}>
            <div className="month-heading">
              <h2>
                {dated
                  ? dateLabel(`${month}-01`, { month: "long", year: "numeric" })
                  : "Days ahead"}
              </h2>
              <span>Bars show each day’s elapsed share</span>
            </div>
            {dated && (
              <div className="week">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
            )}
            <div className="calendar-grid">
              {Array.from({ length: offset }, (_, i) => (
                <div className="empty-day" key={`blank-${i}`} />
              ))}
              {Array.from({ length: total }, (_, i) => {
                const day = dated
                  ? days.find((d) => Number(d.date!.slice(8)) === i + 1)
                  : days[i];
                if (!day)
                  return (
                    <div className="empty-day" key={i}>
                      {i + 1}
                    </div>
                  );
                const legs = activeLegs(model, day);
                return (
                  <button
                    className="calendar-day"
                    key={i}
                    data-day={day.index + 1}
                    aria-pressed={day.index === selectedDay}
                    aria-label={`${dayLabel(day)}. ${legs.map((l) => `${name(model, l.from)} to ${name(model, l.to)}`).join(". ")}. ${day.inTransit ? "Night in transit" : `Night: ${name(model, day.overnight)}`}`}
                    onClick={() => selectDay(day.index)}
                  >
                    <span className="day-date">
                      {dated ? i + 1 : `Day ${i + 1}`}
                      <span className="mobile-weekday">
                        {day.date
                          ? ` · ${dateLabel(day.date, { weekday: "short" })}`
                          : ""}
                      </span>
                    </span>
                    {legs.map((l) => (
                      <span className="cell-travel" key={l.id}>
                        <span>
                          {name(model, l.from)} → {name(model, l.to)}
                        </span>
                        <small>
                          {l.block.mode ?? "Travel"} ·{" "}
                          {l.durationMs !== undefined
                            ? duration(l.durationMs)
                            : "timing open"}
                          {l.endDay > l.day ? " · overnight" : ""}
                        </small>
                      </span>
                    ))}
                    <span className="night">
                      {!day.inTransit && <Icon kind="bed" />}
                      {day.inTransit
                        ? "In transit"
                        : name(model, day.overnight)}
                    </span>
                    <Bands model={model} day={day} />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
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
          ↗ {d.label}
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
      <div>
        <p className="selected-date">
          {day.date
            ? dateLabel(day.date, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })
            : "Dates open"}{" "}
          · Day {day.index + 1} of {model.days.length}
        </p>
        <h2>
          {legs.length
            ? `${name(model, legs[0].from)} → ${name(model, legs.at(-1)!.to)}`
            : name(model, day.overnight)}
        </h2>
        {legs.map((l) => (
          <div className="leg-detail" key={l.id}>
            <strong>
              {legs.length > 1
                ? `${name(model, l.from)} → ${name(model, l.to)} · `
                : ""}
              {l.block.mode ?? "Travel"} ·{" "}
              {l.durationMs !== undefined
                ? duration(l.durationMs)
                : "duration unknown"}
            </strong>
            <span>
              {l.block.start ?? "Departure open"} {name(model, l.from)} →{" "}
              {l.block.end ?? "arrival open"} {name(model, l.to)}
              {l.endDay > l.day ? ` · arrives Day ${l.endDay}` : ""}
            </span>
            <small>
              Local times
              {l.from && model.trip.places[l.from].timezone
                ? ` · ${model.trip.places[l.from].timezone}`
                : ""}
              {model.trip.places[l.to].timezone &&
              model.trip.places[l.to].timezone !==
                model.trip.places[l.from ?? ""]?.timezone
                ? ` → ${model.trip.places[l.to].timezone}`
                : ""}
            </small>
            {l.block.notes && <p>{l.block.notes}</p>}
            <Documents documents={l.block.documents} folder={folder} />
          </div>
        ))}
        {day.source.notes && <p className="day-note">{day.source.notes}</p>}
        <Documents documents={day.source.documents} folder={folder} />
      </div>
      <div className="day-breakdown">
        <div className="day-hours">
          <span>{day.durationMs ? "00" : ""}</span>
          <Bands model={model} day={day} />
          <span>{day.durationMs ? duration(day.durationMs) : ""}</span>
        </div>
        <div className="segment-labels">
          {!day.hasUnknownTiming &&
            day.segments.map((s, i) => (
              <span key={i}>
                <i style={{ background: color(model, s.place) }} />
                {s.type === "stay"
                  ? name(model, s.place)
                  : s.type === "travel"
                    ? "Transit"
                    : "Location open"}{" "}
                · {duration(s.durationMs!)}
              </span>
            ))}
        </div>
        {day.hasUnknownTiming && activeLegs(model, day).length > 0 && (
          <p className="timing-note">Timing unknown · no elapsed proportions</p>
        )}
        <span className="night">
          {!day.inTransit && <Icon kind="bed" />}
          {day.inTransit
            ? "Night in transit"
            : `Night: ${name(model, day.overnight)}`}
        </span>
      </div>
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
          : "Location timing unknown"
      : "";
  const time =
    itinerary && moment
      ? moment.leg
        ? `${clockAt(itinerary, moment.at, moment.leg.from)} → ${clockAt(itinerary, moment.at, moment.leg.to)}`
        : clockAt(itinerary, moment.at, moment.place)
      : undefined;
  const readout = day
    ? `${dayLabel(day)} · ${time ?? (moment?.unknown ? "timing unknown" : "time open")}`
    : "";
  return (
    <main data-theme={theme} style={{ colorScheme: theme } as CSSProperties}>
      <header className="top">
        <div className="heading">
          <div>
            <p className="kicker">ATLAS / YOUR JOURNEY</p>
            <h1>{itinerary?.trip.title ?? "Trip Atlas"}</h1>
            <p className="meta">
              {itinerary
                ? `${itinerary.trip.startDate ? `${dayLabel(itinerary.days[0])} – ${dateLabel(itinerary.days.at(-1)!.date!, { day: "numeric", month: "long", year: "numeric" })}` : "Dates open"} · ${itinerary.days.length} days · ${Object.keys(itinerary.trip.places).length} places${itinerary.legs.length ? ` · ${duration(itinerary.knownTravelDurationMs)} ${itinerary.legs.some((l) => l.durationMs === undefined) ? "known" : "entered"} travel` : ""}`
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
          <section aria-label={tab === "map" ? "Map view" : "Calendar view"}>
            {tab === "map" ? (
              <TripMap model={itinerary} moment={moment} status={status} />
            ) : (
              <Calendar
                model={itinerary}
                selectedDay={dayIndex}
                selectDay={(n) => setValue(n + (value % 1))}
              />
            )}
          </section>
          <DayDetails
            model={itinerary}
            day={day}
            folder={selected.slice(0, selected.lastIndexOf("/"))}
          />
          <footer className="scrubber">
            <div className="time-head">
              <label htmlFor="trip-time">Move through the trip</label>
              <output htmlFor="trip-time">{readout}</output>
            </div>
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
              {[
                ...new Set([
                  0,
                  Math.floor((itinerary.days.length - 1) / 2),
                  itinerary.days.length - 1,
                ]),
              ].map((i) => (
                <span key={i}>{dayLabel(itinerary.days[i])}</span>
              ))}
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
