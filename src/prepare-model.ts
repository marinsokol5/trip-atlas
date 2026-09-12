import type { Itinerary, PackingItem, TripPreparation } from "./itinerary.ts";

export function hasPreparationContent(model: Itinerary): boolean {
  return !!(
    model.trip.prepare?.checklist?.length || model.trip.prepare?.packing?.length
  );
}

export function preparationLists(prepare: TripPreparation) {
  const checklist = (prepare.checklist ?? []).map((item, index) => ({
    item,
    rank: index + 1,
  }));
  const packing = prepare.packing ?? [];
  const categories = new Map<string | undefined, PackingItem[]>();
  for (const item of packing) {
    const group = categories.get(item.category);
    if (group) group.push(item);
    else categories.set(item.category, [item]);
  }
  return {
    checklist,
    checklistRemaining: checklist.filter(({ item }) => !item.done).length,
    packingGroups: [...categories].map(([category, items]) => ({
      category,
      items,
    })),
    // Count authored list entries; an omitted quantity never invents a unit count.
    packingRemaining: packing.filter((item) => !item.packed).length,
  };
}
