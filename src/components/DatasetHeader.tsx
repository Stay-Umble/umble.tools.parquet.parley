import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronLeft,
  ChevronRight,
  Filter,
  Grid3X3,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { formatCount } from "../lib/format";
import type { ColumnSchema, DatasetSummary, Filter as RecipeFilter, Recipe } from "../types";

interface DatasetHeaderProps {
  dataset: DatasetSummary;
  columns: ColumnSchema[];
  recipe: Recipe;
  totalRows: number;
  offset: number;
  pageSize: number;
  canPageBack: boolean;
  canPageForward: boolean;
  busy: boolean;
  recipePanelOpen: boolean;
  onPageBack: () => void;
  onPageForward: () => void;
  onRemoveFilter: (column: string) => void;
  onClearFilters: () => void;
  onToggleRecipePanel: () => void;
}

export function DatasetHeader({
  dataset,
  columns,
  recipe,
  totalRows,
  offset,
  pageSize,
  canPageBack,
  canPageForward,
  busy,
  recipePanelOpen,
  onPageBack,
  onPageForward,
  onRemoveFilter,
  onClearFilters,
  onToggleRecipePanel,
}: DatasetHeaderProps) {
  const visibleColumns = columns.filter((column) => !column.hidden).length;
  const numericColumns = columns.filter((column) =>
    /INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGEINT|SMALLINT|TINYINT|BIGINT/i.test(column.logicalType),
  ).length;
  const categoricalColumns = Math.max(0, visibleColumns - numericColumns);
  const recipeStepCount =
    recipe.filters.length + recipe.sorts.length + recipe.transforms.length;
  const filteredPercent =
    dataset.rowCount === 0 ? 0 : Math.round((totalRows / dataset.rowCount) * 100);
  const start = totalRows === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, totalRows);

  return (
    <header className="dataset-header">
      <div className="dataset-title-row">
        <div className="dataset-title-lockup">
          <div className="dataset-file-icon">
            <Grid3X3 size={18} />
          </div>
          <div className="dataset-title">
            <div className="dataset-name-row">
              <h2>{dataset.displayName}</h2>
              <span className="file-badge">Parquet</span>
            </div>
            <p>
              Local file <span>/</span> {formatCount(dataset.rowCount)} rows <span>/</span>{" "}
              {formatCount(visibleColumns)} columns
            </p>
          </div>
        </div>

        <div className="dataset-header-actions">
          <button
            type="button"
            className={recipePanelOpen ? "view-tab active" : "view-tab"}
            onClick={onToggleRecipePanel}
          >
            <SlidersHorizontal size={15} />
            <span>Recipe</span>
          </button>
          <div className="pager">
            <button
              type="button"
              className="icon-button"
              title="Previous page"
              disabled={!canPageBack || busy}
              onClick={onPageBack}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {formatCount(start)}-{formatCount(end)}
            </span>
            <button
              type="button"
              className="icon-button"
              title="Next page"
              disabled={!canPageForward || busy}
              onClick={onPageForward}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="dataset-metrics" aria-label="Dataset metrics">
        <Metric label="Total rows" value={formatCount(dataset.rowCount)} detail="Source dataset" tone="blue" />
        <Metric
          label="Columns"
          value={formatCount(visibleColumns)}
          detail={`${formatCount(numericColumns)} numeric, ${formatCount(categoricalColumns)} categorical`}
          tone="violet"
        />
        <Metric
          label="Filtered"
          value={formatCount(totalRows)}
          detail={`${formatCount(filteredPercent)}% of source rows`}
          tone="green"
        />
        <Metric
          label="Recipe steps"
          value={formatCount(recipeStepCount)}
          detail="Filters, sorts, transforms"
          tone="amber"
        />
      </div>

      <div className="recipe-strip" aria-label="Active recipe">
        {recipe.filters.length === 0 && recipe.sorts.length === 0 && recipe.transforms.length === 0 ? (
          <span className="recipe-empty">Clean view</span>
        ) : null}

        {recipe.filters.map((filter) => (
          <button
            type="button"
            className="recipe-chip"
            key={`filter:${filter.column}`}
            title="Remove filter"
            onClick={() => onRemoveFilter(filter.column)}
          >
            <Filter size={14} />
            <span>{filterSummary(filter, columns)}</span>
            <X size={13} />
          </button>
        ))}

        {recipe.sorts.map((sort) => (
          <span className="recipe-chip passive" key={`sort:${sort.column}`}>
            {sort.direction === "asc" ? <ArrowUpAZ size={14} /> : <ArrowDownAZ size={14} />}
            <span>
              {displayName(sort.column, columns)} {sort.direction}
            </span>
          </span>
        ))}

        {recipe.transforms.length > 0 ? (
          <span className="recipe-chip passive">
            <Sparkles size={14} />
            <span>{formatCount(recipe.transforms.length)} transforms</span>
          </span>
        ) : null}

        {recipe.filters.length > 0 ? (
          <button
            type="button"
            className="recipe-clear"
            title="Clear filters"
            onClick={onClearFilters}
          >
            <RotateCcw size={14} />
            <span>Clear</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "blue" | "amber" | "rose" | "violet";
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div>
        <strong>{value}</strong>
      </div>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  );
}

function filterSummary(filter: RecipeFilter, columns: ColumnSchema[]): string {
  const name = displayName(filter.column, columns);
  if (filter.kind === "set") {
    const count = filter.values.length + (filter.includeNull ? 1 : 0);
    return `${name}: ${count} selected`;
  }
  if (filter.kind === "range") {
    return `${name}: ${filter.min || "min"} to ${filter.max || "max"}`;
  }
  return `${name}: ${filter.contains}`;
}

function displayName(column: string, columns: ColumnSchema[]): string {
  return columns.find((item) => item.name === column)?.displayName ?? column;
}
