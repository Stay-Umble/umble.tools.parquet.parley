import type { Filter, Recipe, SortSpec, TransformStep } from "../types";

export const emptyRecipe: Recipe = {
  filters: [],
  sorts: [],
  transforms: [],
  visibleColumns: null,
};

export function replaceSorts(recipe: Recipe, sorts: SortSpec[]): Recipe {
  return { ...recipe, sorts };
}

export function clearFilters(recipe: Recipe): Recipe {
  return { ...recipe, filters: [] };
}

export function removeColumnFilter(recipe: Recipe, column: string): Recipe {
  return {
    ...recipe,
    filters: recipe.filters.filter((filter) => filter.column !== column),
  };
}

export function upsertFilter(recipe: Recipe, filter: Filter): Recipe {
  const filters = recipe.filters.filter((item) => item.column !== filter.column);
  const shouldKeep =
    filter.kind === "set"
      ? filter.values.length > 0 || filter.includeNull
      : filter.kind === "range"
        ? Boolean(filter.min || filter.max)
        : filter.contains.trim().length > 0;

  return {
    ...recipe,
    filters: shouldKeep ? [...filters, filter] : filters,
  };
}

export function toggleFacetValue(
  recipe: Recipe,
  column: string,
  value: string | null,
): Recipe {
  const existing = recipe.filters.find(
    (filter): filter is Extract<Filter, { kind: "set" }> =>
      filter.column === column && filter.kind === "set",
  );
  const values = new Set(existing?.values ?? []);
  let includeNull = existing?.includeNull ?? false;

  if (value === null) {
    includeNull = !includeNull;
  } else if (values.has(value)) {
    values.delete(value);
  } else {
    values.add(value);
  }

  return upsertFilter(recipe, {
    kind: "set",
    column,
    values: [...values].sort(),
    includeNull,
  });
}

export function upsertTransform(recipe: Recipe, step: TransformStep): Recipe {
  const transforms = recipe.transforms.filter((existing) => {
    if (step.kind === "computedColumn") {
      return !(existing.kind === "computedColumn" && existing.name === step.name);
    }
    if ("column" in step && "column" in existing) {
      return !(existing.kind === step.kind && existing.column === step.column);
    }
    return true;
  });

  const shouldKeep =
    step.kind === "hideColumn" ||
    step.kind === "computedColumn" ||
    (step.kind === "renameColumn" && step.displayName.trim().length > 0) ||
    (step.kind === "castColumn" && step.targetType.trim().length > 0);

  return {
    ...recipe,
    transforms: shouldKeep ? [...transforms, step] : transforms,
  };
}

export function removeTransform(
  recipe: Recipe,
  predicate: (step: TransformStep) => boolean,
): Recipe {
  return {
    ...recipe,
    transforms: recipe.transforms.filter((step) => !predicate(step)),
  };
}

export function activeFilterCount(recipe: Recipe): number {
  return recipe.filters.length;
}

