import { Circle, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { TripPreparation } from "./itinerary";
import { preparationLists } from "./prepare-model";

// Short notes read as part of the title; longer ones get their own line.
const INLINE_NOTE_LENGTH = 48;

// Authored in the itinerary, so the marks are status, not controls.
function StatusIcon({ complete }: { complete: boolean }) {
  const Icon = complete ? CircleCheck : Circle;
  return (
    <Icon
      className="prepare-status"
      size={16}
      strokeWidth={complete ? 2.2 : 1.8}
      aria-hidden="true"
    />
  );
}

function Item({
  title,
  notes,
  complete,
  status,
  children,
}: {
  title: string;
  notes?: string;
  complete: boolean;
  status: string;
  children?: ReactNode;
}) {
  const inline =
    notes !== undefined &&
    notes.length <= INLINE_NOTE_LENGTH &&
    !notes.includes("\n");
  return (
    <li className={`prepare-item${complete ? " is-complete" : ""}`}>
      <StatusIcon complete={complete} />
      <div className="prepare-item-copy">
        <p className="prepare-item-title">
          <span className="sr-only">{status}</span>
          {title}
          {children}
          {inline && <span className="prepare-item-inline-note">{notes}</span>}
        </p>
        {notes && !inline && <p className="prepare-item-notes">{notes}</p>}
      </div>
    </li>
  );
}

function CardHeading({
  id,
  title,
  done,
  total,
  verb,
}: {
  id: string;
  title: string;
  done: number;
  total: number;
  verb: string;
}) {
  return (
    <header className="prepare-card-heading">
      <div>
        <h3 id={id}>{title}</h3>
        <span>
          {done === total ? `All ${verb}` : `${done} of ${total} ${verb}`}
        </span>
      </div>
      <progress value={done} max={total} aria-labelledby={id} />
    </header>
  );
}

function DoneHeading({ count }: { count: number }) {
  return (
    <h4 className="prepare-done-heading">
      <CircleCheck size={13} strokeWidth={2.2} aria-hidden="true" />
      {count} done
    </h4>
  );
}

export function Prepare({ prepare }: { prepare: TripPreparation }) {
  const { checklist, checklistRemaining, packingGroups, packingRemaining } =
    preparationLists(prepare);
  const hasChecklist = checklist.length > 0;
  const hasPacking = packingGroups.length > 0;
  if (!hasChecklist && !hasPacking) return null;
  const showCategories = packingGroups.some(
    (group) => group.category !== undefined,
  );
  const openTasks = checklist.filter(({ item }) => !item.done);
  const doneTasks = checklist.filter(({ item }) => item.done);
  const openGroups = packingGroups
    .map(({ category, items }) => ({
      category,
      items: items.filter((item) => !item.packed),
    }))
    .filter(({ items }) => items.length > 0);
  const packed = packingGroups.flatMap(({ items }) =>
    items.filter((item) => item.packed),
  );
  const packingTotal = packingGroups.reduce(
    (sum, { items }) => sum + items.length,
    0,
  );
  const task = ({ item, rank }: (typeof checklist)[number]) => (
    <Item
      key={rank}
      title={item.title}
      notes={item.notes}
      complete={item.done === true}
      status={`Priority ${rank}, ${item.done ? "done" : "to do"}: `}
    />
  );
  const packingItem = (item: (typeof packed)[number], index: number) => (
    <Item
      key={index}
      title={item.title}
      notes={item.notes}
      complete={item.packed === true}
      status={item.packed ? "Packed: " : "To pack: "}
    >
      {item.quantity !== undefined && (
        <span className="prepare-quantity">
          <span className="sr-only">Quantity: </span>
          <span aria-hidden="true">× </span>
          {item.quantity}
        </span>
      )}
    </Item>
  );
  return (
    <section className="prepare-view" aria-label="Checklist">
      <div
        className={`prepare-layout${hasChecklist && hasPacking ? " has-both" : ""}`}
      >
        {hasChecklist && (
          <section
            className="prepare-card prepare-checklist"
            aria-labelledby="prepare-checklist-heading"
          >
            <CardHeading
              id="prepare-checklist-heading"
              title="To do"
              done={checklist.length - checklistRemaining}
              total={checklist.length}
              verb="done"
            />
            {openTasks.length > 0 && (
              <ol className="prepare-items" role="list">
                {openTasks.map(task)}
              </ol>
            )}
            {doneTasks.length > 0 && (
              <div className="prepare-done">
                <DoneHeading count={doneTasks.length} />
                <ol className="prepare-items" role="list">
                  {doneTasks.map(task)}
                </ol>
              </div>
            )}
          </section>
        )}
        {hasPacking && (
          <section
            className="prepare-card prepare-packing"
            aria-labelledby="prepare-packing-heading"
          >
            <CardHeading
              id="prepare-packing-heading"
              title="Packing"
              done={packingTotal - packingRemaining}
              total={packingTotal}
              verb="packed"
            />
            {openGroups.length > 0 && (
              <div className="prepare-packing-columns">
                {openGroups.map(({ category, items }) => (
                  <div
                    className="prepare-packing-group"
                    key={
                      category === undefined
                        ? "uncategorized"
                        : `category:${category}`
                    }
                  >
                    {showCategories && <h4>{category ?? "Uncategorized"}</h4>}
                    <ul className="prepare-items" role="list">
                      {items.map(packingItem)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {packed.length > 0 && (
              <div className="prepare-done">
                <DoneHeading count={packed.length} />
                <ul
                  className="prepare-items prepare-packing-columns"
                  role="list"
                >
                  {packed.map(packingItem)}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
