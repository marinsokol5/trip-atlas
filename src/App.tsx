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
  Files,
  ListChecks,
  Compass,
  Check,
  CircleAlert,
  MapPin,
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
import { geoGraticule10, geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import {
  fitGlobe,
  globeFacing,
  globeOrigin,
  globeProjection,
  globeRouteCurve,
  globeShapes,
  levelGlobe,
  rotateGlobe,
  zoomGlobe,
} from "./globe";
import type { GlobeView } from "./globe";
import { normalizeTrip, tripsRoot } from "./itinerary";
import { loadJson, parseManifest } from "./load-trip";
import type { TripEntry } from "./load-trip";
import type { Itinerary, NormalizedDay, Leg } from "./itinerary";
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
  mapCountries,
  mapHighlightedCountries,
  areaDays,
  scopedPosition,
  tripPosition,
  advancePlayback,
  mapArea,
  componentLegs,
  placeColor,
  groupKey,
  modeKind,
  legDuration,
  dayBands,
  dayModeDurations,
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
  calendarCountryCodes,
  countryFlag,
  countryName,
  routeCurve,
  spanCenter,
  mapDurationFilters,
} from "./view-model";
import type { Point, MapDurationFilter } from "./view-model";
import world from "./assets/world.json";
import "./App.css";
import { Overview } from "./Overview";
import { Bookings, DayBookings, Documents } from "./Bookings";
import { Prepare } from "./Prepare";
import { activeTripView, availableTripViews, parseTripView } from "./trip-view";
import type { TripView } from "./trip-view";
import { ThemedSelect } from "./ThemedSelect";
import { activityBooking, bookingGaps } from "./booking-model";
import { moneyLabel } from "./overview-model";
import { MapLabelsMenu } from "./MapLabelsMenu";
import { Flag, flagsShown } from "./Flag";
import { Logo } from "./Logo";
import { useMapLabelPreference } from "./use-map-label-preference";

type Entry = TripEntry;
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
const unmovedView = { x: 0, y: 0, k: 1 };
/** A whole trip across countries starts with flight times; a single area with trips over an hour. */
function savedDurationFilter(
  key: string,
  wholeTrip: boolean,
): MapDurationFilter {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved && mapDurationFilters.includes(saved as MapDurationFilter))
      return saved as MapDurationFilter;
  } catch {
    // Defaults remain usable when browser storage is unavailable.
  }
  return wholeTrip ? "flights" : "60";
}
const name = (model: Itinerary, id?: string) =>
  id ? (model.trip.places[id].name ?? id) : "Location open";
const color = placeColor;
function Icon({ kind }: { kind: string }) {
  const Component =
    (
      {
        overview: LayoutDashboard,
        bookings: Files,
        prepare: ListChecks,
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
        level: Compass,
      } as Record<string, typeof MapIcon>
    )[kind] ?? ArrowRight;
  return <Component className="icon" aria-hidden="true" strokeWidth={1.6} />;
}
/** Distance and climb for a leg, e.g. "14 km · ↑800 m ↓650 m". */
function legStats(block: Leg["block"]): string | undefined {
  const parts = [
    block.distanceKm !== undefined && `${block.distanceKm} km`,
    [
      block.ascentMeters !== undefined && `↑${block.ascentMeters} m`,
      block.descentMeters !== undefined && `↓${block.descentMeters} m`,
    ]
      .filter(Boolean)
      .join(" "),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
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
  // A whole trip across countries, origin included, sits on a turnable globe; one country stays a flat map.
  const globe = useMemo(
    () => !country && mapCountries(model).length > 1,
    [model, country],
  );
  const [flatView, setFlatView] = useState(unmovedView);
  const [turnedGlobe, setGlobeView] = useState<GlobeView>();
  // Coastlines drop to a draft while the globe is dragged, then redraw in full.
  const [turning, setTurning] = useState(false);
  const [viewCountry, setViewCountry] = useState(country);
  if (viewCountry !== country) {
    setViewCountry(country);
    setFlatView(unmovedView);
    setGlobeView(undefined);
  }
  // The globe is re-projected instead of transformed, so its drawing needs no pan or zoom.
  const view = globe ? unmovedView : flatView;
  const locations = useMemo(
    () =>
      Object.entries(model.trip.places)
        .filter(([id, p]) => area.placeIds.has(id) && p.coordinates)
        .map(([id, p]) => ({
          id,
          coordinates: [p.coordinates!.lon, p.coordinates!.lat] as Point,
        })),
    [model, area],
  );
  const globeFit = useMemo(
    () => fitGlobe(locations.map((p) => p.coordinates)),
    [locations],
  );
  const globeView = useMemo(
    () => turnedGlobe ?? { center: globeFit.center, k: 1 },
    [turnedGlobe, globeFit],
  );
  // The multi-country whole trip and single areas each remember their own duration labels.
  const durationKey = globe
    ? "trip-atlas-duration-filter:whole"
    : "trip-atlas-duration-filter";
  const [durationFilter, setDurationFilter] = useState(() =>
    savedDurationFilter(durationKey, globe),
  );
  const [filterKey, setFilterKey] = useState(durationKey);
  if (filterKey !== durationKey) {
    setFilterKey(durationKey);
    setDurationFilter(savedDurationFilter(durationKey, globe));
  }
  const frame = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 900, height: 480 });
  // The canvas around the fixed-ratio frame also shows geography, most of all on phones.
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 480 });
  const frameScale = Math.min(frameSize.width / 900, frameSize.height / 480);
  useEffect(() => {
    const node = frame.current;
    const canvas = node?.parentElement;
    if (!node || !canvas) return;
    const observer = new ResizeObserver((entries) => {
      for (const { target, contentRect } of entries)
        if (contentRect.width > 0 && contentRect.height > 0)
          (target === node ? setFrameSize : setCanvasSize)({
            width: contentRect.width,
            height: contentRect.height,
          });
    });
    observer.observe(node);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  // Map units from the globe's middle to the farthest visible canvas corner.
  const globeReach =
    Math.hypot(canvasSize.width, canvasSize.height) / 2 / frameScale +
    Math.abs(globeOrigin[1] - 240);
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
      const factor = wheelZoomFactor(
        event.deltaY,
        event.deltaMode,
        rect.height,
      );
      if (globe)
        setGlobeView((view) =>
          zoomGlobe(
            view ?? { center: globeFit.center, k: 1 },
            factor,
            globeFit.scale,
            anchor,
          ),
        );
      else setFlatView((view) => zoomMap(view, factor, anchor));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [globe, globeFit]);
  const pixelScale = frameScale * view.k;
  const numbered = !showGroupNames;
  const dragged = useRef(false);
  const drag = useRef<
    | { x: number; y: number; vx: number; vy: number; globe: GlobeView }
    | undefined
  >(undefined);
  const { groups, first, last } = area;
  const transfers = useMemo(() => transferPlaces(model), [model]);
  const connections = useMemo(
    () => mapDisplayConnections(model, country),
    [model, country],
  );
  const geometry = useMemo(() => {
    let projection: GeoProjection;
    if (globe) projection = globeProjection(globeView, globeFit.scale);
    else {
      projection = geoMercator()
        .rotate([-spanCenter(locations.map((p) => p.coordinates))[0], 0])
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
    }
    const coordinates = Object.fromEntries(
      locations.map((p) => [p.id, p.coordinates]),
    );
    // Places on the far side of the globe drop out with their routes and labels.
    const points = Object.fromEntries(
      locations
        .filter((p) => !globe || globeFacing(globeView.center, p.coordinates))
        .map((p) => [p.id, projection(p.coordinates)!]),
    );
    const routes = connections.flatMap(({ outbound, inbound }) =>
      outbound.legs.flatMap((leg, index) => {
        if (!leg.from || !points[leg.from] || !points[leg.to]) return [];
        const curve = globe
          ? globeRouteCurve(
              projection,
              globeView.center,
              coordinates[leg.from],
              coordinates[leg.to],
            )
          : routeCurve(points[leg.from], points[leg.to]);
        return curve
          ? [
              {
                leg,
                reverseLeg: inbound?.legs[inbound.legs.length - 1 - index],
                curve,
              },
            ]
          : [];
      }),
    );
    const path = geoPath(projection);
    const outlines = globe
      ? globeShapes(world.features, projection, globeReach, turning ? 5 : 2.5)
      : world.features.map((feature) =>
          path(feature as unknown as GeoPermissibleObjects),
        );
    const shapes = world.features.map((feature, i) => ({
      id: i,
      path: outlines[i],
      name: feature.properties.name,
      country: feature.properties.iso2,
    }));
    const sphere = globe ? path({ type: "Sphere" }) : null;
    const graticule = globe ? path(geoGraticule10()) : null;
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
    return { points, routes, shapes, labels, sphere, graticule };
  }, [
    locations,
    groups,
    transfers,
    connections,
    globe,
    globeView,
    globeFit,
    globeReach,
    turning,
  ]);
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
    if (globe) setGlobeView(zoomGlobe(globeView, factor, globeFit.scale));
    else setFlatView((view) => zoomMap(view, factor));
  };
  return (
    <>
      <div
        className={`map-canvas${globe ? " globe" : ""}`}
        data-testid="map-canvas"
      >
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
                  setFlatView(unmovedView);
                  setGlobeView(undefined);
                }}
              >
                <Icon kind="reset" />
              </button>
              {globe && (
                <button
                  aria-label="Level globe, north up"
                  title="Level globe, north up"
                  onClick={() => {
                    setTooltipPlace(null);
                    setGlobeView(levelGlobe(globeView));
                  }}
                >
                  <Icon kind="level" />
                </button>
              )}
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
                    window.localStorage.setItem(durationKey, filter);
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
                globe: globeView,
              };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (start) {
                if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) {
                  dragged.current = true;
                  setTooltipPlace(null);
                }
                const dx = (e.clientX - start.x) / frameScale;
                const dy = (e.clientY - start.y) / frameScale;
                if (globe) {
                  if (dragged.current) setTurning(true);
                  setGlobeView(
                    rotateGlobe(
                      start.globe,
                      dx,
                      dy,
                      globeFit.scale * start.globe.k,
                    ),
                  );
                } else {
                  // React may apply this update after pointerup clears the drag ref.
                  const x = start.vx + dx;
                  const y = start.vy + dy;
                  setFlatView((v) => ({ ...v, x, y }));
                }
              }
            }}
            onPointerUp={() => {
              drag.current = undefined;
              setTurning(false);
            }}
            onPointerCancel={() => {
              drag.current = undefined;
              setTurning(false);
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
              <radialGradient id="globe-shade" cx="38%" cy="30%" r="75%">
                <stop offset="0%" className="globe-light" />
                <stop offset="60%" className="globe-light" stopOpacity={0} />
                <stop offset="100%" className="globe-dark" />
              </radialGradient>
            </defs>
            <g
              transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
              data-testid="map-transform"
            >
              {geometry.sphere && (
                <g aria-hidden="true">
                  <path className="globe-sphere" d={geometry.sphere} />
                  <path
                    className="globe-graticule"
                    d={geometry.graticule ?? ""}
                  />
                </g>
              )}
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
              {geometry.sphere && (
                <path
                  className="globe-shade"
                  d={geometry.sphere}
                  fill="url(#globe-shade)"
                  aria-hidden="true"
                />
              )}
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
  const gaps = useMemo(() => bookingGaps(model), [model]);
  const bookingStatus = useMemo(() => {
    const inScope = new Set(
      slots.flatMap((slot) =>
        slot.inScope && slot.day ? [slot.day.index + 1] : [],
      ),
    );
    const nights = gaps.nights.filter((n) => inScope.has(n));
    const openNights = nights.filter((n) => gaps.unbookedNights.has(n)).length;
    const openFlights = gaps.flights.filter(
      (leg) =>
        gaps.unbookedFlights.has(leg) &&
        Array.from(
          { length: leg.endDay - leg.day + 1 },
          (_, i) => leg.day + i,
        ).some((n) => inScope.has(n)),
    ).length;
    if (!nights.length && !openFlights) return undefined;
    if (!openNights && !openFlights)
      return { done: true, text: "All nights and flights booked" };
    return {
      done: false,
      text: [
        nights.length &&
          `${nights.length - openNights} of ${nights.length} nights booked`,
        openFlights &&
          `${openFlights} ${openFlights === 1 ? "flight" : "flights"} to book`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }, [gaps, slots]);
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
  const unbookedFlightOn = (day: NormalizedDay) =>
    activeLegs(model, day).some((leg) => gaps.unbookedFlights.has(leg));
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
        {bookingStatus && (
          <span
            className={`booking-status${bookingStatus.done ? " is-done" : ""}`}
          >
            {bookingStatus.done ? <Check /> : <CircleAlert />}
            {bookingStatus.text}
          </span>
        )}
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
                aria-label={`${dayLabel(day)}. ${calendarCountries(model, day)}. ${dayTitle(model, day)}. Night: ${name(model, day.overnight)}${gaps.unbookedNights.has(day.index + 1) ? ", not booked yet" : ""}`}
              >
                <span className="calendar-date-context">
                  <span className="day-date">
                    {day.date
                      ? dateLabel(day.date, { day: "numeric", month: "short" })
                      : `Day ${day.index + 1}`}
                  </span>
                  {calendarCountryCodes(model, day).length > 0 && (
                    <span className="calendar-country">
                      {flagsShown
                        ? calendarCountryCodes(model, day).map(
                            (code, index) => (
                              <Fragment key={index}>
                                {index > 0 && " → "}
                                <Flag code={code} />
                              </Fragment>
                            ),
                          )
                        : calendarCountries(model, day)}
                    </span>
                  )}
                </span>
                <span className="day-title">{dayTitle(model, day)}</span>
                <span className="cell-chips">
                  {dayModeDurations(model, day).map((m) => (
                    <span
                      key={m.kind}
                      className={`leg-chip${m.kind === "flight" && unbookedFlightOn(day) ? " is-unbooked" : ""}`}
                      title={
                        (m.total
                          ? `${m.label ? `${m.label} of ` : ""}${m.total} ${m.kind}`
                          : m.kind) +
                        (m.kind === "flight" && unbookedFlightOn(day)
                          ? " · not booked yet"
                          : "")
                      }
                    >
                      <Icon kind={m.kind} />
                      <span>{m.label}</span>
                      <span className="sr-only">{m.kind}</span>
                    </span>
                  ))}
                </span>
                <span
                  className={`night${gaps.unbookedNights.has(day.index + 1) ? " is-unbooked" : ""}`}
                  title={
                    gaps.unbookedNights.has(day.index + 1)
                      ? "Not booked yet"
                      : undefined
                  }
                >
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
                  nightsOnly
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
type RouteStop = { place?: string; arrives?: string; departs?: string };
/** A day's legs as one connected route: stop, leg, stop, leg, stop… */
function DayRoute({
  model,
  day,
  legs,
  folder,
}: {
  model: Itinerary;
  day: NormalizedDay;
  legs: Leg[];
  folder: string;
}) {
  const items: ({ stop: RouteStop } | { leg: Leg })[] = [];
  let last: RouteStop | undefined;
  for (const leg of legs) {
    if (!last || last.place !== leg.from) {
      last = { place: leg.from };
      items.push({ stop: last });
    }
    // An overnight arrival started on an earlier day departs "yesterday".
    if (leg.block.start && leg.day === day.index + 1)
      last.departs = leg.block.start;
    items.push({ leg });
    last = {
      place: leg.to,
      arrives:
        leg.block.end && leg.endDay === day.index + 1
          ? leg.block.end
          : undefined,
    };
    items.push({ stop: last });
  }
  const zone = (id?: string) =>
    model.trip.places[id ?? ""]?.timezone ?? model.trip.timezone;
  return (
    <ol className="day-route" aria-label="Route">
      {items.map((item, index) =>
        "stop" in item ? (
          <li className="route-stop" key={index}>
            <span className="route-dot" aria-hidden="true" />
            <strong>{name(model, item.stop.place)}</strong>
            {(item.stop.arrives || item.stop.departs) && (
              <small>
                {[
                  item.stop.arrives && `arr ${item.stop.arrives}`,
                  item.stop.departs && `dep ${item.stop.departs}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            )}
          </li>
        ) : (
          <li className="route-leg" key={index}>
            {componentLegs(item.leg).map((part) => (
              <span className="route-part" key={part.id}>
                <Icon kind={modeKind(part)} />
                {legDuration(part)} {part.block.mode ?? "travel"}
              </span>
            ))}
            {legStats(item.leg.block) && (
              <span className="route-stats">{legStats(item.leg.block)}</span>
            )}
            {item.leg.endDay !== item.leg.day && (
              <span className="route-stats">
                Day {item.leg.day} → Day {item.leg.endDay}
                {item.leg.block.start &&
                item.leg.block.end &&
                zone(item.leg.from) !== zone(item.leg.to)
                  ? ` · ${zone(item.leg.from)} → ${zone(item.leg.to)}`
                  : ""}
              </span>
            )}
            {item.leg.block.notes && <p>{item.leg.block.notes}</p>}
            <Documents documents={item.leg.block.documents} folder={folder} />
          </li>
        ),
      )}
    </ol>
  );
}
function DayDetails({
  model,
  day,
  folder,
  nightsOnly = false,
}: {
  model: Itinerary;
  day: NormalizedDay;
  folder: string;
  nightsOnly?: boolean;
}) {
  const legs = activeLegs(model, day);
  return (
    <section className="details" aria-label="Selected day">
      <p className="selected-date">
        {dayLabel(day)} · Day {day.index + 1} of {model.days.length}
      </p>
      {calendarCountryCodes(model, day).length > 0 && (
        <p className="day-countries">
          {calendarCountryCodes(model, day).map((code, index) => (
            <Fragment key={index}>
              {index > 0 && " → "}
              <Flag code={code} /> {countryName(code)}
            </Fragment>
          ))}
        </p>
      )}
      <h2>{dayTitle(model, day)}</h2>
      <GroupLabels model={model} day={day} />
      <span className="night">
        <Icon kind="bed" />
        {day.inTransit
          ? "Night in transit"
          : `Night: ${name(model, day.overnight)}`}
      </span>
      <Bands model={model} day={day} />
      {/* Header, then the day's must-know, what to see, how to get around, and the paperwork. */}
      {day.source.notes && <p className="day-must-know">{day.source.notes}</p>}
      {!!day.source.activities?.length && (
        <section className="day-details" aria-label="Activities">
          <h3>Activities</h3>
          <ul className="activities">
            {day.source.activities.map((activity, index) => {
              // A booking's price replaces the estimate, as in the Overview.
              const booking = activityBooking(model, activity.id);
              const cost = booking?.cost
                ? {
                    value: booking.cost.amount,
                    estimated:
                      (booking.cost.status ?? "estimated") === "estimated",
                  }
                : activity.estimatedCost !== undefined
                  ? { value: activity.estimatedCost, estimated: true }
                  : undefined;
              const price =
                cost &&
                moneyLabel(
                  { ...cost, known: 1, missing: 0 },
                  model.trip.currency,
                );
              return (
                <li key={index}>
                  <span className="activity-line">
                    {activity.mapUrl ? (
                      <a
                        className="activity-name"
                        href={activity.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Google Maps"
                      >
                        {activity.name}
                        <MapPin strokeWidth={1.75} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="activity-name">{activity.name}</span>
                    )}
                    {booking && (
                      <span className="activity-booked" title={booking.title}>
                        <Check strokeWidth={2} aria-hidden="true" />
                        Booked
                      </span>
                    )}
                    {price && <span className="activity-price">{price}</span>}
                  </span>
                  {activity.tip && (
                    <span className="activity-tip">{activity.tip}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {legs.length > 0 && (
        <section className="day-details" aria-label="Route">
          <h3>Route</h3>
          <DayRoute model={model} day={day} legs={legs} folder={folder} />
        </section>
      )}
      <DayBookings
        model={model}
        dayNumber={day.index + 1}
        folder={folder}
        nightsOnly={nightsOnly}
        documents={day.source.documents}
      />
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
    [tab, setTab] = useState<TripView>(() => {
      try {
        return parseTripView(window.localStorage.getItem("trip-atlas-view"));
      } catch {
        /* Use Overview without storage. */
      }
      return "overview";
    });
  const carriedCountry = useRef("");
  const viewNavigation = useRef<HTMLElement>(null);
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
    const controller = new AbortController();
    loadJson(tripsRoot + "index.json", controller.signal)
      .then(parseManifest)
      .then((trips) => {
        if (active) {
          setEntries(trips);
          const requested = new URLSearchParams(window.location.search).get(
            "trip",
          );
          setSelected(
            trips.find((entry) => entry.path === requested)?.path ??
              trips[0].path,
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
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    const controller = new AbortController();
    loadJson(
      tripsRoot + selected.split("/").map(encodeURIComponent).join("/"),
      controller.signal,
    )
      .then((data) => {
        if (!active) return;
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
      controller.abort();
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
  const activeTab = activeTripView(tab, itinerary);
  useLayoutEffect(() => {
    const nav = viewNavigation.current;
    if (!nav) return;
    const revealActiveTab = () => {
      const active = nav.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      if (!active) return;
      const tabBounds = active.getBoundingClientRect();
      const left = nav.getBoundingClientRect().left + nav.clientLeft;
      const right = left + nav.clientWidth;
      // Move only this horizontal strip; never scroll the page or move focus.
      if (tabBounds.left < left) nav.scrollLeft -= left - tabBounds.left;
      else if (tabBounds.right > right)
        nav.scrollLeft += tabBounds.right - right;
    };
    revealActiveTab();
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeTab, itinerary]);
  const fullView =
    activeTab === "overview" ||
    activeTab === "bookings" ||
    activeTab === "prepare";
  // ← / → step through the timeline's days in Map and Calendar, like the day-step buttons.
  const stepDay = useRef<(offset: number) => void>(() => {});
  stepDay.current = (offset) => {
    const next = days[scopeIndex + offset];
    if (next) selectPosition(next.index + 0.5);
  };
  useEffect(() => {
    if (fullView) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target as HTMLElement | null;
      // Leave arrows alone where they already mean something (the slider, fields, menus).
      if (
        target?.closest(
          "input, textarea, select, [contenteditable], [role=menu], [role=listbox]",
        )
      )
        return;
      event.preventDefault();
      stepDay.current(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullView]);
  return (
    <main
      className={`app-shell ${fullView ? "overview-shell" : ""}`}
      data-theme={theme}
      style={{ colorScheme: theme } as CSSProperties}
    >
      <header className="top">
        <div className="heading">
          <div className="brand">
            <div className="brand-title">
              <Logo />
              <h1 title={itinerary?.trip.title}>
                {itinerary?.trip.title ?? "Trip Atlas"}
              </h1>
            </div>
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
              {/* The checklist covers the whole trip; the Area stays in place, locked, and returns afterwards. */}
              <ThemedSelect
                label="Trip area"
                value={activeTab === "prepare" ? "" : country}
                disabled={activeTab === "prepare"}
                title={
                  activeTab === "prepare"
                    ? "Checklist and packing cover the whole trip"
                    : undefined
                }
                options={[
                  { value: "", label: "Whole trip" },
                  ...mapAreas(itinerary).map((area) => ({
                    value: area.country,
                    label:
                      flagsShown && countryFlag(area.country)
                        ? `${countryFlag(area.country)} ${area.name}`
                        : area.name,
                  })),
                ]}
                onChange={changeArea}
              />
            </div>
          )}
          <nav aria-label="Trip view" ref={viewNavigation}>
            {availableTripViews(itinerary).map((t) => (
              <button
                key={t}
                aria-pressed={activeTab === t}
                className={activeTab === t ? "tab active" : "tab"}
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
                    : t === "calendar"
                      ? "Calendar"
                      : t === "bookings"
                        ? "Documents"
                        : "Checklist"}
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
          {activeTab === "overview" && (
            <Overview
              key={`${selected}:${country}`}
              model={itinerary}
              country={country}
              onSelectCountry={changeArea}
            />
          )}
          {activeTab === "bookings" && (
            <Bookings
              model={itinerary}
              country={country}
              folder={selected.slice(0, selected.lastIndexOf("/"))}
              onWholeTrip={() => changeArea("")}
            />
          )}
          {activeTab === "prepare" && itinerary.trip.prepare && (
            <Prepare prepare={itinerary.trip.prepare} />
          )}
          <div
            className={`view-layout ${fullView ? "map" : activeTab}`}
            hidden={fullView}
          >
            <section
              aria-label={activeTab === "map" ? "Map view" : "Calendar view"}
            >
              <div className="map-view" hidden={activeTab !== "map"}>
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
              {activeTab === "calendar" && (
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
              nightsOnly={activeTab === "calendar"}
            />
          </div>
          <footer className="scrubber" hidden={fullView}>
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
                title="Previous day (←)"
                disabled={scopeIndex <= 0}
                onClick={() => selectPosition(days[scopeIndex - 1].index + 0.5)}
              >
                <Icon kind="prev" />
              </button>
              <strong>{dayLabel(day)}</strong>
              <button
                aria-label="Next day"
                title="Next day (→)"
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
