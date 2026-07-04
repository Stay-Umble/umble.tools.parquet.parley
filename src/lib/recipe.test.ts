import { describe, expect, it } from "vitest";
import {
  clearFilters,
  emptyRecipe,
  toggleFacetValue,
  upsertFilter,
  upsertTransform,
} from "./recipe";

describe("recipe helpers", () => {
  it("toggles facet values with OR semantics inside a column", () => {
    const withOne = toggleFacetValue(emptyRecipe, "status", "new");
    expect(withOne.filters).toEqual([
      {
        kind: "set",
        column: "status",
        values: ["new"],
        includeNull: false,
      },
    ]);

    const withTwo = toggleFacetValue(withOne, "status", "done");
    expect(withTwo.filters[0]).toMatchObject({
      kind: "set",
      values: ["done", "new"],
    });

    const withoutOne = toggleFacetValue(withTwo, "status", "new");
    expect(withoutOne.filters[0]).toMatchObject({
      kind: "set",
      values: ["done"],
    });
  });

  it("removes empty filters", () => {
    const filtered = upsertFilter(emptyRecipe, {
      kind: "text",
      column: "name",
      contains: "abc",
      caseSensitive: false,
    });
    expect(filtered.filters).toHaveLength(1);

    const cleared = upsertFilter(filtered, {
      kind: "text",
      column: "name",
      contains: "",
      caseSensitive: false,
    });
    expect(cleared.filters).toHaveLength(0);
  });

  it("replaces transforms targeting the same column", () => {
    const renamed = upsertTransform(emptyRecipe, {
      kind: "renameColumn",
      column: "amount",
      displayName: "Amount",
    });
    const renamedAgain = upsertTransform(renamed, {
      kind: "renameColumn",
      column: "amount",
      displayName: "Invoice Amount",
    });

    expect(renamedAgain.transforms).toEqual([
      {
        kind: "renameColumn",
        column: "amount",
        displayName: "Invoice Amount",
      },
    ]);
  });

  it("clears all filters without dropping transforms", () => {
    const recipe = upsertTransform(
      {
        ...emptyRecipe,
        filters: [
          {
            kind: "set",
            column: "status",
            values: ["new"],
            includeNull: false,
          },
        ],
      },
      {
        kind: "hideColumn",
        column: "internal_id",
      },
    );

    const cleared = clearFilters(recipe);
    expect(cleared.filters).toEqual([]);
    expect(cleared.transforms).toHaveLength(1);
  });
});

