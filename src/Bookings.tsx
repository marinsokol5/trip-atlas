import {
  BedDouble,
  ExternalLink,
  FileText,
  Ticket,
  TrainFront,
} from "lucide-react";
import type { Booking, DocumentLink, Itinerary } from "./itinerary";
import { documentUrl } from "./itinerary";
import {
  bookingAllocation,
  bookingCountries,
  bookingRange,
  bookingsOnDay,
} from "./booking-model";
import { dayCountries, dayLabel, dateLabel } from "./view-model";

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
function allocationLabel(booking: Booking, model: Itinerary): string {
  if (booking.status === "cancelled") return "Excluded from totals";
  const allocation = bookingAllocation(booking, model.trip);
  if (!allocation) return "Unallocated · excluded from totals";
  if (allocation.type === "accommodation")
    return `${allocation.nights.length} ${allocation.nights.length === 1 ? "night" : "nights"} · replaces stay estimates`;
  if (allocation.type === "living")
    return "Replaces the whole living budget on the linked days";
  if (allocation.type === "additional") return "Additional to living budget";
  return "Replaces the linked journey estimate";
}
const typeLabels = {
  accommodation: "Accommodation",
  transport: "Transport",
  activity: "Activity",
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
  const dates = bookingDates(booking, model);
  const Icon =
    booking.type === "accommodation"
      ? BedDouble
      : booking.type === "transport"
        ? TrainFront
        : Ticket;
  const { end } = bookingRange(booking, model.trip);
  const allocation = bookingAllocation(booking, model.trip);
  const checkout =
    booking.type === "accommodation" &&
    dayNumber !== undefined &&
    (end === dayNumber ||
      (end === undefined &&
        allocation?.type === "accommodation" &&
        allocation.nights.includes(dayNumber - 1) &&
        !allocation.nights.includes(dayNumber)));
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
          {(dates || booking.place) && (
            <p className="booking-meta">
              {[
                booking.place
                  ? model.trip.places[booking.place].name
                  : undefined,
                dates,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {checkout && <span className="booking-checkout">Check-out today</span>}
      </div>
      <div className="booking-facts">
        <span
          className={`booking-status booking-status-${booking.status ?? "unspecified"}`}
        >
          {booking.status
            ? booking.status[0].toUpperCase() + booking.status.slice(1)
            : "Status not specified"}
        </span>
        {booking.reference && (
          <span className="booking-reference">
            Reference <strong>{booking.reference}</strong>
          </span>
        )}
      </div>
      {booking.cost && (
        <div className="booking-cost">
          <div>
            <strong>
              {new Intl.NumberFormat("en-IE", {
                style: "currency",
                currency: model.trip.currency!,
                maximumFractionDigits: 2,
              }).format(booking.cost.amount)}
            </strong>
            <span>{booking.cost.status ?? "estimated"} · per person</span>
          </div>
          <p>{allocationLabel(booking, model)}</p>
        </div>
      )}
      <Documents documents={booking.documents} folder={folder} />
    </article>
  );
}
export function DayBookings({
  model,
  dayNumber,
  folder,
}: {
  model: Itinerary;
  dayNumber: number;
  folder: string;
}) {
  const bookings = bookingsOnDay(model, dayNumber);
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
            {(["accommodation", "transport", "activity"] as const).map(
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
                    {group.map((booking, index) => (
                      <BookingCard
                        key={index}
                        booking={booking}
                        model={model}
                        folder={folder}
                      />
                    ))}
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
        {bookings.length
          ? "Reservation status and cost status are recorded separately. "
          : ""}
        Files open from the itinerary’s folder. Edit the JSON externally, then
        refresh to see changes.
      </p>
    </section>
  );
}
