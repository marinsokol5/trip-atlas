import { Check } from "lucide-react";
import type { TripPreparation } from "./itinerary";
import { preparationLists } from "./prepare-model";

function Completion({
  complete,
  packing = false,
}: {
  complete: boolean;
  packing?: boolean;
}) {
  return (
    <span className="prepare-status">
      {complete && <Check aria-hidden="true" size={13} strokeWidth={1.8} />}
      {packing
        ? complete
          ? "Packed"
          : "To pack"
        : complete
          ? "Done"
          : "To do"}
    </span>
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
  return (
    <section className="prepare-view" aria-labelledby="prepare-heading">
      <header className="prepare-heading">
        <h2 id="prepare-heading">Prepare</h2>
      </header>
      <div
        className={`prepare-layout${hasChecklist && hasPacking ? " has-both" : ""}`}
      >
        {hasChecklist && (
          <section
            className="prepare-checklist"
            aria-labelledby="prepare-checklist-heading"
          >
            <header className="prepare-section-heading">
              <h3 id="prepare-checklist-heading">Before you go</h3>
              <span>
                {checklistRemaining
                  ? `${checklistRemaining} remaining`
                  : "All done"}
              </span>
            </header>
            <ol
              className="prepare-tasks"
              aria-label="Checklist in priority order"
              role="list"
            >
              {checklist.map(({ item, rank }) => (
                <li
                  key={rank}
                  className={`prepare-task${item.done ? " is-complete" : ""}`}
                >
                  <span className="prepare-rank" aria-hidden="true">
                    {rank}
                  </span>
                  <div className="prepare-item-copy">
                    <p className="prepare-item-title">
                      <span className="sr-only">Priority {rank}: </span>
                      {item.title}
                    </p>
                    {item.notes && (
                      <p className="prepare-item-notes">{item.notes}</p>
                    )}
                  </div>
                  <Completion complete={item.done === true} />
                </li>
              ))}
            </ol>
          </section>
        )}
        {hasPacking && (
          <section
            className="prepare-packing"
            aria-labelledby="prepare-packing-heading"
          >
            <header className="prepare-section-heading">
              <h3 id="prepare-packing-heading">Packing list</h3>
              <span>
                {packingRemaining
                  ? `${packingRemaining} to pack`
                  : "All packed"}
              </span>
            </header>
            {packingGroups.map(({ category, items }) => (
              <div
                className="prepare-packing-group"
                key={
                  category === undefined
                    ? "uncategorized"
                    : `category:${category}`
                }
              >
                {showCategories && <h4>{category ?? "Uncategorized"}</h4>}
                <ul className="prepare-packing-items" role="list">
                  {items.map((item, index) => (
                    <li
                      key={index}
                      className={`prepare-packing-item${item.packed ? " is-complete" : ""}`}
                    >
                      <div className="prepare-item-copy">
                        <p className="prepare-item-title">
                          {item.title}
                          {item.quantity !== undefined && (
                            <span className="prepare-quantity">
                              <span className="sr-only">Quantity: </span>
                              <span aria-hidden="true">× </span>
                              {item.quantity}
                            </span>
                          )}
                        </p>
                        {item.notes && (
                          <p className="prepare-item-notes">{item.notes}</p>
                        )}
                      </div>
                      <Completion complete={item.packed === true} packing />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </section>
  );
}
