import {
  Backpack,
  BedDouble,
  Briefcase,
  Bus,
  Car,
  Coffee,
  ExternalLink,
  FileText,
  Luggage,
  Footprints,
  MapPin,
  Plane,
  Receipt,
  Sandwich,
  Ship,
  Soup,
  Ticket,
  TrainFront,
} from "lucide-react";
import type { Booking, DocumentLink, Itinerary } from "./itinerary";
import { documentUrl } from "./itinerary";
import {
  bookingAllocation,
  bookingCountries,
  bookingsOnDay,
  isCheckoutDay,
  nightBookingsOnDay,
} from "./booking-model";
import { dayCountries, dayLabel, dateLabel, modeKind } from "./view-model";

/** Meals in the order they happen for one night: dinner, breakfast, lunch box. */
const mealKinds = [
  { key: "dinner", label: "Dinner", Icon: Soup },
  { key: "breakfast", label: "Breakfast", Icon: Coffee },
  { key: "lunch", label: "Lunch", Icon: Sandwich },
] as const;
function Meals({ meals }: { meals: NonNullable<Booking["meals"]> }) {
  return (
    <span className="booking-meals">
      {mealKinds.map(({ key, label, Icon }) => {
        const meal = meals[key];
        const state =
          meal === undefined ? "unknown" : meal ? "included" : "excluded";
        const text =
          typeof meal === "string"
            ? `${label}: ${meal}`
            : `${label} ${state === "unknown" ? "not specified" : state === "included" ? "included" : "not included"}`;
        return (
          <span
            key={key}
            className={`booking-meal booking-meal-${state}`}
            title={text}
            aria-label={text}
            role="img"
          >
            <Icon strokeWidth={1.75} aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}
const bagKinds = {
  checked: { label: "checked", Icon: Luggage },
  cabin: { label: "cabin", Icon: Briefcase },
  personal: { label: "personal item", Icon: Backpack },
} as const;
function Baggage({ bags }: { bags: NonNullable<Booking["baggage"]> }) {
  return (
    <ul className="booking-baggage" aria-label="Baggage per person">
      {bags.map((bag, index) => {
        const { label, Icon } = bagKinds[bag.type];
        const text = `${bag.pieces}${bag.kg !== undefined ? ` × ${bag.kg} kg` : ""} ${label}`;
        return (
          <li key={index} title={`${text}, per person`}>
            <Icon strokeWidth={1.75} aria-hidden="true" />
            {text}
          </li>
        );
      })}
    </ul>
  );
}
export function Documents({
  documents,
  folder,
}: {
  documents?: DocumentLink[];
  folder: string;
}) {
  return documents?.length ? (
    <div className="documents">
      {documents.map((document, index) => (
        <a
          key={index}
          href={documentUrl(folder, document.path)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="icon" aria-hidden="true" strokeWidth={1.6} />
          {document.label}
        </a>
      ))}
    </div>
  ) : null;
}
function bookingDates(booking: Booking, model: Itinerary): string | undefined {
  const label = (date?: string, day?: number) =>
    date
      ? dateLabel(date, { day: "numeric", month: "short", year: "numeric" })
      : day
        ? `Day ${day}`
        : undefined;
  const start = label(booking.startDate, booking.startDay),
    end = label(booking.endDate, booking.endDay);
  if (booking.startDate && booking.endDate && start !== end) {
    // "4–5 Dec 2026", "30 Nov – 2 Dec 2026": share the parts both ends have.
    const [a, b] = [booking.startDate, booking.endDate];
    const from =
      a.slice(0, 7) === b.slice(0, 7)
        ? dateLabel(a, { day: "numeric" })
        : a.slice(0, 4) === b.slice(0, 4)
          ? dateLabel(a)
          : start;
    return `${from}${a.slice(0, 7) === b.slice(0, 7) ? "–" : " – "}${end}`;
  }
  if (start && end && start !== end) return `${start} – ${end}`;
  if (start)
    return booking.type === "accommodation" ? `Check-in ${start}` : start;
  if (end)
    return `${booking.type === "accommodation" ? "Check-out" : "Until"} ${end}`;
  const a = bookingAllocation(booking, model.trip);
  if (a?.type === "transport") {
    const leg = model.legs.find((leg) => leg.block.id === a.leg)!;
    return leg.day === leg.endDay
      ? `Day ${leg.day}`
      : `Days ${leg.day}–${leg.endDay}`;
  }
  if (a?.type === "additional") return `Day ${a.day}`;
  if (a?.type === "living") return `Days ${a.days.join(", ")}`;
  if (a?.type === "accommodation")
    return `Nights after days ${a.nights.join(", ")}`;
  return undefined;
}
/** Only unusual cost handling needs a word; a normal linked booking says nothing. */
function allocationLabel(
  booking: Booking,
  model: Itinerary,
): string | undefined {
  if (booking.status === "cancelled") return "Excluded from totals";
  if (booking.type === "other") return undefined;
  const allocation = bookingAllocation(booking, model.trip);
  if (!allocation) return "Not in totals: unallocated";
  if (allocation.type === "living") return "Replaces the living budget";
  if (allocation.type === "additional") return "On top of the living budget";
  return undefined;
}
function nights(booking: Booking, model: Itinerary): number | undefined {
  if (booking.type !== "accommodation") return undefined;
  const allocation = bookingAllocation(booking, model.trip);
  if (allocation?.type === "accommodation") return allocation.nights.length;
  if (booking.startDate && booking.endDate)
    return (
      (Date.parse(booking.endDate) - Date.parse(booking.startDate)) / 864e5
    );
  if (booking.startDay !== undefined && booking.endDay !== undefined)
    return booking.endDay - booking.startDay;
  return undefined;
}
const transportIcons = {
  train: TrainFront,
  bus: Bus,
  walk: Footprints,
  flight: Plane,
  ferry: Ship,
  car: Car,
} as const;
/** A transport booking takes the icon of the journey it pays for. */
function transportIcon(booking: Booking, model: Itinerary) {
  const allocation = bookingAllocation(booking, model.trip);
  const leg =
    allocation?.type === "transport"
      ? model.legs.find((leg) => leg.block.id === allocation.leg)
      : undefined;
  const kind = leg && modeKind(leg);
  return kind && kind in transportIcons
    ? transportIcons[kind as keyof typeof transportIcons]
    : TrainFront;
}
const typeLabels = {
  accommodation: "Accommodation",
  transport: "Transport",
  activity: "Activity",
  other: "Other",
};
export function BookingCard({
  booking,
  model,
  folder,
  dayNumber,
}: {
  booking: Booking;
  model: Itinerary;
  folder: string;
  dayNumber?: number;
}) {
  const dates = bookingDates(booking, model),
    count = nights(booking, model),
    allocation = allocationLabel(booking, model),
    costStatus = booking.cost?.status ?? "estimated",
    money = (amount: number) =>
      new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: model.trip.currency!,
        maximumFractionDigits: 2,
      }).format(amount);
  const Icon =
    booking.type === "accommodation"
      ? BedDouble
      : booking.type === "transport"
        ? transportIcon(booking, model)
        : booking.type === "other"
          ? Receipt
          : Ticket;
  const checkout =
    dayNumber !== undefined && isCheckoutDay(model, booking, dayNumber);
  return (
    <article
      className={`booking-card ${booking.status === "cancelled" ? "booking-cancelled" : ""}`}
    >
      <div className="booking-card-heading">
        <Icon
          className="booking-type-icon"
          aria-label={typeLabels[booking.type]}
          strokeWidth={1.5}
        />
        <div className="booking-identity">
          <h3>{booking.title}</h3>
          {(dates || booking.place || count !== undefined) && (
            <p className="booking-meta">
              {[
                // In a day panel "Night: <place>" already names the place.
                booking.place &&
                (dayNumber === undefined ||
                  model.days[dayNumber - 1].overnight !== booking.place)
                  ? model.trip.places[booking.place].name
                  : undefined,
                dates,
                count !== undefined &&
                  `${count} ${count === 1 ? "night" : "nights"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {checkout && <span className="booking-checkout">Check-out today</span>}
        {booking.coordinates && (
          <a
            className="booking-map-link"
            href={`https://www.google.com/maps/search/?api=1&query=${booking.coordinates.lat},${booking.coordinates.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            aria-label={`Open ${booking.title} in Google Maps`}
          >
            <MapPin strokeWidth={1.75} aria-hidden="true" />
          </a>
        )}
      </div>
      {(booking.checkIn || booking.checkOut || booking.meals) && (
        <div className="booking-stay">
          {(booking.checkIn || booking.checkOut) && (
            <span className="booking-times">
              {[
                booking.checkIn && `In ${booking.checkIn.replace("-", "–")}`,
                booking.checkOut && `Out by ${booking.checkOut}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {booking.meals && <Meals meals={booking.meals} />}
        </div>
      )}
      <div className="booking-facts">
        {/* A plain expense has no reservation to confirm. */}
        {(booking.status || booking.type !== "other") && (
          <span
            className={`booking-status booking-status-${booking.status ?? "unspecified"}`}
          >
            {booking.status === "confirmed" && costStatus === "paid"
              ? "Paid"
              : booking.status
                ? booking.status[0].toUpperCase() + booking.status.slice(1)
                : "Status not specified"}
          </span>
        )}
        {booking.reference && (
          <span className="booking-reference">
            Ref <strong>{booking.reference}</strong>
          </span>
        )}
        {booking.cost && (
          <span
            className="booking-price"
            title={`${costStatus[0].toUpperCase() + costStatus.slice(1)} price per person`}
          >
            <strong>
              {costStatus === "estimated" ? "~" : ""}
              {money(booking.cost.amount)}
            </strong>
            {count !== undefined && count > 1 && (
              <small>
                {money(booking.cost.amount / count)}
                /night
              </small>
            )}
          </span>
        )}
      </div>
      {booking.cost && allocation && (
        <p className="booking-allocation">{allocation}</p>
      )}
      {!!booking.baggage?.length && <Baggage bags={booking.baggage} />}
      {booking.notes && <p className="booking-notes">{booking.notes}</p>}
      <Documents documents={booking.documents} folder={folder} />
    </article>
  );
}
export function DayBookings({
  model,
  dayNumber,
  folder,
  nightsOnly = false,
}: {
  model: Itinerary;
  dayNumber: number;
  folder: string;
  /** Calendar days answer "where do we sleep tonight", omitting checkout stays. */
  nightsOnly?: boolean;
}) {
  const bookings = (nightsOnly ? nightBookingsOnDay : bookingsOnDay)(
    model,
    dayNumber,
  );
  return bookings.length ? (
    <section className="day-bookings" aria-label="Bookings for selected day">
      <h3>Bookings</h3>
      {bookings.map((booking, index) => (
        <BookingCard
          key={index}
          booking={booking}
          model={model}
          folder={folder}
          dayNumber={dayNumber}
        />
      ))}
    </section>
  ) : null;
}
export function Bookings({
  model,
  country,
  folder,
  onWholeTrip,
}: {
  model: Itinerary;
  country: string;
  folder: string;
  onWholeTrip: () => void;
}) {
  const bookings = (model.trip.bookings ?? []).filter(
    (booking) => !country || bookingCountries(model, booking).includes(country),
  );
  const days = model.days.filter(
    (day) =>
      day.source.documents?.length &&
      (!country || dayCountries(model, day).includes(country)),
  );
  const legs = model.legs.filter(
    (leg) =>
      leg.block.documents?.length &&
      (!country ||
        [leg.from, leg.to].some(
          (id) => id && model.trip.places[id].country === country,
        )),
  );
  const hasDocuments = !!(
    model.trip.documents?.length ||
    days.length ||
    legs.length
  );
  return (
    <section className="bookings-view" aria-label="Bookings & Documents view">
      <header className="bookings-heading">
        <h2>Bookings & Documents</h2>
      </header>
      {!bookings.length && !hasDocuments && country && (
        <div className="booking-scope-empty">
          <p>No bookings or documents for this area.</p>
          <button className="overview-back" onClick={onWholeTrip}>
            View the whole trip
          </button>
        </div>
      )}
      <div
        className={`bookings-layout ${bookings.length && hasDocuments ? "has-documents" : ""}`}
      >
        {!!bookings.length && (
          <div className="booking-groups">
            {(["accommodation", "transport", "activity", "other"] as const).map(
              (type) => {
                const group = bookings.filter(
                  (booking) => booking.type === type,
                );
                return group.length ? (
                  <section
                    className="booking-group"
                    key={type}
                    aria-label={typeLabels[type]}
                  >
                    <h3>
                      {type === "activity" ? "Activities" : typeLabels[type]}{" "}
                      <span>{group.length}</span>
                    </h3>
                    <div className="booking-grid">
                      {group.map((booking, index) => (
                        <BookingCard
                          key={index}
                          booking={booking}
                          model={model}
                          folder={folder}
                        />
                      ))}
                    </div>
                  </section>
                ) : null;
              },
            )}
          </div>
        )}
        {hasDocuments && (
          <aside
            className="booking-document-library"
            aria-label="Independent documents"
          >
            <h3>
              <FileText aria-hidden="true" />
              Documents
            </h3>
            {!!model.trip.documents?.length && (
              <section>
                <h4>For the trip</h4>
                <Documents documents={model.trip.documents} folder={folder} />
              </section>
            )}
            {days.map((day) => (
              <section key={day.index}>
                <h4>
                  {dayLabel(day)} · Day {day.index + 1}
                </h4>
                {day.source.title && <p>{day.source.title}</p>}
                <Documents documents={day.source.documents} folder={folder} />
              </section>
            ))}
            {legs.map((leg) => (
              <section key={leg.id}>
                <h4>
                  {model.trip.places[leg.from ?? ""]?.name ?? "Departure"} →{" "}
                  {model.trip.places[leg.to].name}
                </h4>
                <p>
                  Day {leg.day}
                  {leg.endDay !== leg.day ? `–${leg.endDay}` : ""}
                </p>
                <Documents documents={leg.block.documents} folder={folder} />
              </section>
            ))}
          </aside>
        )}
      </div>
      <p className="bookings-footnote">
        {bookings.some((booking) => booking.cost)
          ? "Prices are per person; ~ marks an estimate. "
          : ""}
        Files open from the itinerary’s folder. Edit the JSON externally, then
        refresh to see changes.
      </p>
    </section>
  );
}
