import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Columns3, Database, Hash, Search, Type, X } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedColumn = useMemo(
    () => columns.find((column) => column.name === activeColumn) ?? visibleColumns[0],
    [activeColumn, columns, visibleColumns],
  );

  useEffect(() => {
    if (!activeColumn && visibleColumns.length > 0) {
      setActiveColumn(visibleColumns[0].name);
    }
  }, [activeColumn, visibleColumns]);

  useEffect(() => {
    if (!datasetId || !selectedColumn) {
      setValues([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getFacetValues({
      datasetId,
      column: selectedColumn.name,
      search,
      limit: 80,
      recipe,
    })
      .then((response) => {
        if (!cancelled) {
          setValues(response.values);
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
  }, [datasetId, recipe, search, selectedColumn]);

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

  function isSelected(value: string | null): boolean {
    if (value === null) {
      return setFilter?.includeNull ?? false;
    }
    return setFilter?.values.includes(value) ?? false;
  }

  function updateRange(partial: Partial<Extract<Filter, { kind: "range" }>>) {
    if (!selectedColumn) {
      return;
    }
    onRecipeChange(
      upsertFilter(recipe, {
        kind: "range",
        column: selectedColumn.name,
        min: rangeFilter?.min ?? null,
        max: rangeFilter?.max ?? null,
        ...partial,
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

  const rangeCapable = selectedColumn
    ? /INT|DECIMAL|DOUBLE|FLOAT|REAL|DATE|TIME|TIMESTAMP/i.test(selectedColumn.logicalType)
    : false;
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
              <small>{column.logicalType}</small>
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
        <div className="facet-detail">
          <div className="selected-facet-card">
            <div>
              <strong>{selectedColumn.displayName}</strong>
              <span>{selectedColumn.logicalType}</span>
            </div>
            {selectedCount > 0 ? <em>{formatCount(selectedCount)} selected</em> : null}
          </div>

          <div className="search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search values"
            />
          </div>

          <div className="filter-controls">
            <label>
              <span>Contains</span>
              <input
                value={textFilter?.contains ?? ""}
                onChange={(event) => updateText(event.target.value)}
                placeholder="Any text"
              />
            </label>
            {rangeCapable ? (
              <div className="range-row">
                <label>
                  <span>Min</span>
                  <input
                    value={rangeFilter?.min ?? ""}
                    onChange={(event) => updateRange({ min: event.target.value })}
                    placeholder="Lower"
                  />
                </label>
                <label>
                  <span>Max</span>
                  <input
                    value={rangeFilter?.max ?? ""}
                    onChange={(event) => updateRange({ max: event.target.value })}
                    placeholder="Upper"
                  />
                </label>
              </div>
            ) : null}
          </div>

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
        </div>
      ) : (
        <div className="soft-state">No columns</div>
      )}
    </aside>
  );
}

function typeIcon(column: ColumnSchema) {
  if (/INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGEINT|SMALLINT|TINYINT|BIGINT/i.test(column.logicalType)) {
    return <Hash size={14} />;
  }
  if (/VARCHAR|TEXT|CHAR|STRING/i.test(column.logicalType)) {
    return <Type size={14} />;
  }
  return <Columns3 size={14} />;
}
