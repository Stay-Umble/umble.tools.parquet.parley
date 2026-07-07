import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Columns3,
  Database,
  Hash,
  Search,
  Type,
  X,
} from "lucide-react";
import { getFacetValues } from "../lib/api";
import { formatCount } from "../lib/format";
import { removeColumnFilter, toggleFacetValue, upsertFilter } from "../lib/recipe";
import type {
  ColumnSchema,
  DatasetSummary,
  FacetValue,
  Filter,
  Recipe,
} from "../types";

type ColumnKind = "numeric" | "date" | "timestamp" | "time" | "text" | "categorical";
type RangeMode = "between" | "gte" | "lte" | "exact";
type TemporalMode = "exact" | "range";

interface FacetSidebarProps {
  datasetId: string | null;
  dataset: DatasetSummary | null;
  columns: ColumnSchema[];
  recipe: Recipe;
  onRecipeChange: (recipe: Recipe) => void;
}

export function FacetSidebar({
  datasetId,
  dataset,
  columns,
  recipe,
  onRecipeChange,
}: FacetSidebarProps) {
  const visibleColumns = columns.filter((column) => !column.hidden);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<FacetValue[]>([]);
  const [rangeBounds, setRangeBounds] = useState<{ minValue: string | null; maxValue: string | null }>({
    minValue: null,
    maxValue: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("between");
  const [temporalMode, setTemporalMode] = useState<TemporalMode>("range");
  const [exactDraft, setExactDraft] = useState("");

  const selectedColumn = useMemo(
    () => columns.find((column) => column.name === activeColumn) ?? visibleColumns[0],
    [activeColumn, columns, visibleColumns],
  );
  const columnKind = classifyColumn(selectedColumn);
  const usesRangePanel = isRangeKind(columnKind);
  const usesTemporalPanel = isTemporalKind(columnKind);
  const usesDatePickerPanel = columnKind === "date";

  const setFilter = recipe.filters.find(
    (filter): filter is Extract<Filter, { kind: "set" }> =>
      filter.kind === "set" && filter.column === selectedColumn?.name,
  );
  const rangeFilter = recipe.filters.find(
    (filter): filter is Extract<Filter, { kind: "range" }> =>
      filter.kind === "range" && filter.column === selectedColumn?.name,
  );
  const textFilter = recipe.filters.find(
    (filter): filter is Extract<Filter, { kind: "text" }> =>
      filter.kind === "text" && filter.column === selectedColumn?.name,
  );

  useEffect(() => {
    if (!activeColumn && visibleColumns.length > 0) {
      setActiveColumn(visibleColumns[0].name);
    }
  }, [activeColumn, visibleColumns]);

  useEffect(() => {
    setSearch("");
    setExactDraft("");
    setRangeMode("between");
    setTemporalMode(setFilter ? "exact" : "range");
  }, [selectedColumn?.name]);

  useEffect(() => {
    if (!datasetId || !selectedColumn) {
      setValues([]);
      setRangeBounds({ minValue: null, maxValue: null });
      return;
    }

    let cancelled = false;
    const includeValues = !usesRangePanel;
    setLoading(true);
    setError(null);
    getFacetValues({
      datasetId,
      column: selectedColumn.name,
      search: includeValues ? search : null,
      limit: includeValues ? 80 : 0,
      includeValues,
      recipe,
    })
      .then((response) => {
        if (!cancelled) {
          setValues(includeValues ? response.values : []);
          setRangeBounds({
            minValue: response.minValue ?? null,
            maxValue: response.maxValue ?? null,
          });
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, recipe, search, selectedColumn, usesRangePanel]);

  const filteredColumns = visibleColumns.filter((column) => {
    const query = columnSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return (
      column.displayName.toLowerCase().includes(query) ||
      column.name.toLowerCase().includes(query) ||
      column.logicalType.toLowerCase().includes(query)
    );
  });
  const selectedCount = (setFilter?.values.length ?? 0) + (setFilter?.includeNull ? 1 : 0);
  const activeFilterLabel =
    selectedCount > 0
      ? `${formatCount(selectedCount)} selected`
      : rangeFilter
        ? "Range active"
        : textFilter
          ? "Text active"
          : null;

  function isSelected(value: string | null): boolean {
    if (value === null) {
      return setFilter?.includeNull ?? false;
    }
    return setFilter?.values.includes(value) ?? false;
  }

  function updateRange(min: string | null, max: string | null) {
    if (!selectedColumn) {
      return;
    }
    onRecipeChange(
      upsertFilter(recipe, {
        kind: "range",
        column: selectedColumn.name,
        min: emptyToNull(min),
        max: emptyToNull(max),
      }),
    );
  }

  function updateText(contains: string) {
    if (!selectedColumn) {
      return;
    }
    onRecipeChange(
      upsertFilter(recipe, {
        kind: "text",
        column: selectedColumn.name,
        contains,
        caseSensitive: textFilter?.caseSensitive ?? false,
      }),
    );
  }

  function switchRangeMode(nextMode: RangeMode) {
    setRangeMode(nextMode);
    const current = rangeFilter?.min ?? rangeFilter?.max ?? "";
    if (!current) {
      return;
    }
    if (nextMode === "exact") {
      updateRange(current, current);
    }
    if (nextMode === "gte") {
      updateRange(current, null);
    }
    if (nextMode === "lte") {
      updateRange(null, current);
    }
  }

  function switchTemporalMode(nextMode: TemporalMode) {
    if (nextMode === temporalMode) {
      return;
    }
    setTemporalMode(nextMode);
    if (selectedColumn) {
      onRecipeChange(removeColumnFilter(recipe, selectedColumn.name));
    }
  }

  function addExactValue() {
    if (!selectedColumn || !exactDraft.trim()) {
      return;
    }
    const values = new Set(setFilter?.values ?? []);
    values.add(exactDraft.trim());
    onRecipeChange(
      upsertFilter(recipe, {
        kind: "set",
        column: selectedColumn.name,
        values: [...values].sort(),
        includeNull: setFilter?.includeNull ?? false,
      }),
    );
    setExactDraft("");
  }

  function removeExactValue(value: string) {
    if (!selectedColumn || !setFilter) {
      return;
    }
    onRecipeChange(
      upsertFilter(recipe, {
        kind: "set",
        column: selectedColumn.name,
        values: setFilter.values.filter((item) => item !== value),
        includeNull: setFilter.includeNull,
      }),
    );
  }

  const inputType = inputTypeForKind(columnKind);
  const inputStep = inputStepForKind(columnKind);
  const normalizedMin = inputValue(rangeFilter?.min, columnKind);
  const normalizedMax = inputValue(rangeFilter?.max, columnKind);
  const exactRangeValue =
    normalizedMin && normalizedMin === normalizedMax ? normalizedMin : normalizedMin || normalizedMax;

  return (
    <aside className="facet-sidebar" aria-label="Filters">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">Explore</span>
          <h2>Filters</h2>
        </div>
        {selectedColumn ? (
          <button
            className="icon-button subtle"
            type="button"
            title="Clear column filter"
            onClick={() => onRecipeChange(removeColumnFilter(recipe, selectedColumn.name))}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="panel-search">
        <Search size={15} />
        <input
          value={columnSearch}
          onChange={(event) => setColumnSearch(event.target.value)}
          placeholder="Find column"
        />
      </div>

      <div className="column-picker" role="listbox" aria-label="Columns">
        {filteredColumns.length === 0 ? <div className="soft-state compact">No columns</div> : null}
        {filteredColumns.map((column) => {
          const active = recipe.filters.some((filter) => filter.column === column.name);
          return (
            <button
              type="button"
              key={column.name}
              className={[
                column.name === selectedColumn?.name ? "selected" : "",
                active ? "has-filter" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setActiveColumn(column.name);
                setSearch("");
              }}
            >
              <span className="column-icon">{typeIcon(column)}</span>
              <span className="column-name">{column.displayName}</span>
              <small title={column.logicalType}>{typeBadgeLabel(column)}</small>
              {active ? <CheckCircle2 size={14} className="column-state" /> : null}
            </button>
          );
        })}
      </div>

      <div className="explorer-insights">
        <div className="dataset-mini-card">
          <span>
            <Database size={16} />
          </span>
          <div>
            <strong>Dataset</strong>
            <p>{dataset?.displayName ?? "No file open"}</p>
            <small>
              {dataset
                ? `${formatCount(dataset.rowCount)} rows / ${formatCount(columns.length)} columns`
                : "Open a Parquet file"}
            </small>
          </div>
        </div>
      </div>

      {selectedColumn ? (
        <div className={usesRangePanel ? "facet-detail range-detail" : "facet-detail"}>
          <div className="selected-facet-card">
            <div>
              <strong>{selectedColumn.displayName}</strong>
              <span title={selectedColumn.logicalType}>{typeBadgeLabel(selectedColumn)}</span>
            </div>
            {activeFilterLabel ? <em>{activeFilterLabel}</em> : null}
          </div>

          {usesRangePanel ? (
            <>
              <div className="range-bounds">
                <span>
                  Min <strong>{loading ? "Loading" : displayValue(rangeBounds.minValue, columnKind)}</strong>
                </span>
                <span>
                  Max <strong>{loading ? "Loading" : displayValue(rangeBounds.maxValue, columnKind)}</strong>
                </span>
              </div>

              {usesDatePickerPanel ? (
                <div className="filter-mode-tabs" aria-label="Date filter mode">
                  <button
                    type="button"
                    className={temporalMode === "exact" ? "active" : ""}
                    onClick={() => switchTemporalMode("exact")}
                  >
                    Exact
                  </button>
                  <button
                    type="button"
                    className={temporalMode === "range" ? "active" : ""}
                    onClick={() => switchTemporalMode("range")}
                  >
                    Range
                  </button>
                </div>
              ) : null}

              {!usesTemporalPanel ? (
                <div className="filter-mode-tabs" aria-label="Numeric filter mode">
                  <button
                    type="button"
                    className={rangeMode === "between" ? "active" : ""}
                    onClick={() => switchRangeMode("between")}
                  >
                    Between
                  </button>
                  <button
                    type="button"
                    className={rangeMode === "gte" ? "active" : ""}
                    onClick={() => switchRangeMode("gte")}
                  >
                    &gt;=
                  </button>
                  <button
                    type="button"
                    className={rangeMode === "lte" ? "active" : ""}
                    onClick={() => switchRangeMode("lte")}
                  >
                    &lt;=
                  </button>
                  <button
                    type="button"
                    className={rangeMode === "exact" ? "active" : ""}
                    onClick={() => switchRangeMode("exact")}
                  >
                    =
                  </button>
                </div>
              ) : null}

              {usesDatePickerPanel && temporalMode === "exact" ? (
                <div className="exact-value-panel">
                  <label>
                    <span>{columnKind === "date" ? "Date" : "Value"}</span>
                    <div className="value-entry-row">
                      <input
                        type={inputType}
                        step={inputStep}
                        value={exactDraft}
                        onChange={(event) => setExactDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addExactValue();
                          }
                        }}
                      />
                      <button type="button" onClick={addExactValue} disabled={!exactDraft.trim()}>
                        Add
                      </button>
                    </div>
                  </label>
                  <div className="selected-value-list">
                    {(setFilter?.values ?? []).length === 0 ? (
                      <div className="soft-state compact">No exact values</div>
                    ) : null}
                    {(setFilter?.values ?? []).map((value) => (
                      <button
                        type="button"
                        className="value-chip"
                        key={value}
                        onClick={() => removeExactValue(value)}
                        title="Remove value"
                      >
                        <span>{displayValue(value, columnKind)}</span>
                        <X size={13} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="filter-controls">
                  {rangeMode === "between" || usesTemporalPanel ? (
                    <div className={usesTemporalPanel ? "range-row temporal-row" : "range-row"}>
                      <label>
                        <span>Min</span>
                        <input
                          type={inputType}
                          step={inputStep}
                          value={normalizedMin}
                          onChange={(event) => updateRange(event.target.value, rangeFilter?.max ?? null)}
                          placeholder="Lower"
                        />
                      </label>
                      <label>
                        <span>Max</span>
                        <input
                          type={inputType}
                          step={inputStep}
                          value={normalizedMax}
                          onChange={(event) => updateRange(rangeFilter?.min ?? null, event.target.value)}
                          placeholder="Upper"
                        />
                      </label>
                    </div>
                  ) : null}

                  {!usesTemporalPanel && rangeMode === "gte" ? (
                    <label>
                      <span>Greater than or equal</span>
                      <input
                        type={inputType}
                        step={inputStep}
                        value={normalizedMin}
                        onChange={(event) => updateRange(event.target.value, null)}
                        placeholder="Minimum"
                      />
                    </label>
                  ) : null}

                  {!usesTemporalPanel && rangeMode === "lte" ? (
                    <label>
                      <span>Less than or equal</span>
                      <input
                        type={inputType}
                        step={inputStep}
                        value={normalizedMax}
                        onChange={(event) => updateRange(null, event.target.value)}
                        placeholder="Maximum"
                      />
                    </label>
                  ) : null}

                  {!usesTemporalPanel && rangeMode === "exact" ? (
                    <label>
                      <span>Equals</span>
                      <input
                        type={inputType}
                        step={inputStep}
                        value={exactRangeValue}
                        onChange={(event) => updateRange(event.target.value, event.target.value)}
                        placeholder="Value"
                      />
                    </label>
                  ) : null}
                </div>
              )}

              {error ? <div className="error-state">{error}</div> : null}
            </>
          ) : (
            <>
              <div className="search-box">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search values"
                />
              </div>

              {columnKind === "text" ? (
                <div className="filter-controls">
                  <label>
                    <span>Contains</span>
                    <input
                      value={textFilter?.contains ?? ""}
                      onChange={(event) => updateText(event.target.value)}
                      placeholder="Any text"
                    />
                  </label>
                </div>
              ) : null}

              <div className="facet-values" aria-live="polite">
                {loading ? <div className="soft-state">Loading values</div> : null}
                {error ? <div className="error-state">{error}</div> : null}
                {!loading && !error && values.length === 0 ? (
                  <div className="soft-state">No values</div>
                ) : null}
                {values.map((item) => (
                  <label key={`${selectedColumn.name}:${item.value ?? "__null"}`} className="facet-row">
                    <input
                      type="checkbox"
                      checked={isSelected(item.value)}
                      onChange={() =>
                        onRecipeChange(toggleFacetValue(recipe, selectedColumn.name, item.value))
                      }
                    />
                    <span className="facet-label">{item.label}</span>
                    <span className="facet-count">{formatCount(item.count)}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="soft-state">No columns</div>
      )}
    </aside>
  );
}

function classifyColumn(column: ColumnSchema | undefined): ColumnKind {
  const logicalType = column?.logicalType.toUpperCase() ?? "";
  if (/TIMESTAMP/.test(logicalType)) {
    return "timestamp";
  }
  if (/\bDATE\b/.test(logicalType)) {
    return "date";
  }
  if (/\bTIME\b/.test(logicalType)) {
    return "time";
  }
  if (/INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGEINT|SMALLINT|TINYINT|BIGINT/.test(logicalType)) {
    return "numeric";
  }
  if (/VARCHAR|TEXT|CHAR|STRING/.test(logicalType)) {
    return "text";
  }
  return "categorical";
}

function isRangeKind(kind: ColumnKind): boolean {
  return kind === "numeric" || isTemporalKind(kind);
}

function isTemporalKind(kind: ColumnKind): boolean {
  return kind === "date" || kind === "timestamp" || kind === "time";
}

function inputTypeForKind(kind: ColumnKind): string {
  if (kind === "date") {
    return "date";
  }
  if (kind === "timestamp") {
    return "datetime-local";
  }
  if (kind === "time") {
    return "time";
  }
  if (kind === "numeric") {
    return "number";
  }
  return "text";
}

function inputStepForKind(kind: ColumnKind): string | undefined {
  if (kind === "numeric") {
    return "any";
  }
  if (kind === "timestamp" || kind === "time") {
    return "1";
  }
  return undefined;
}

function inputValue(value: string | null | undefined, kind: ColumnKind): string {
  if (!value) {
    return "";
  }
  if (kind === "date") {
    return value.slice(0, 10);
  }
  if (kind === "timestamp") {
    return value.replace(" ", "T").slice(0, 19);
  }
  if (kind === "time") {
    return value.slice(0, 8);
  }
  return value;
}

function displayValue(value: string | null | undefined, kind: ColumnKind): string {
  if (!value) {
    return "None";
  }
  if (kind === "timestamp") {
    return value.replace("T", " ");
  }
  return value;
}

function typeBadgeLabel(column: ColumnSchema): string {
  const kind = classifyColumn(column);
  if (kind === "numeric") {
    return "Number";
  }
  if (kind === "date") {
    return "Date";
  }
  if (kind === "timestamp") {
    return "DateTime";
  }
  if (kind === "time") {
    return "Time";
  }
  if (kind === "text") {
    return "Text";
  }
  return "Value";
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function typeIcon(column: ColumnSchema) {
  const kind = classifyColumn(column);
  if (kind === "numeric") {
    return <Hash size={14} />;
  }
  if (isTemporalKind(kind)) {
    return <CalendarDays size={14} />;
  }
  if (kind === "text") {
    return <Type size={14} />;
  }
  return <Columns3 size={14} />;
}
