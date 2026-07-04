import {
  Columns3,
  ChevronRight,
  Download,
  FileInput,
  Filter,
  FolderOpen,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { DatasetSummary, Recipe } from "../types";
import { activeFilterCount } from "../lib/recipe";
import { formatCount } from "../lib/format";

interface ToolbarProps {
  dataset: DatasetSummary | null;
  recipe: Recipe;
  busy: boolean;
  onOpenFiles: () => void;
  onOpenFolder: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onExport: (format: "csv" | "parquet") => void;
  onClearFilters: () => void;
}

export function Toolbar({
  dataset,
  recipe,
  busy,
  onOpenFiles,
  onOpenFolder,
  onOpenProject,
  onSaveProject,
  onExport,
  onClearFilters,
}: ToolbarProps) {
  const filterCount = activeFilterCount(recipe);
  const transformCount = recipe.transforms.length;
  const columnCount = dataset?.columns.length ?? 0;

  return (
    <header className="app-toolbar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <div>
          <h1>Parquet Parley</h1>
          <p>Beta</p>
        </div>
      </div>

      <nav className="breadcrumb" aria-label="Current location">
        <span>Datasets</span>
        <ChevronRight size={14} />
        <strong>{dataset ? dataset.displayName : "Open a dataset"}</strong>
      </nav>

      <div className="toolbar-actions" aria-label="Dataset actions">
        <div className="command-group primary-group">
          <button type="button" className="tool-button primary" onClick={onOpenFiles} disabled={busy}>
            <FileInput size={18} />
            <span>Open File</span>
          </button>
          <button type="button" className="tool-button" onClick={onOpenFolder} disabled={busy}>
            <FolderOpen size={18} />
            <span>Folder</span>
          </button>
        </div>

        <div className="command-group">
          <button type="button" className="tool-button" onClick={onOpenProject} disabled={busy}>
            <SlidersHorizontal size={18} />
            <span>Project</span>
          </button>
          <button
            type="button"
            className="icon-button"
            title="Save project"
            onClick={onSaveProject}
            disabled={!dataset || busy}
          >
            <Save size={18} />
          </button>
        </div>

        <div className="command-group export-menu" aria-label="Export">
          <button
            type="button"
            className="icon-button"
            title="Export CSV"
            onClick={() => onExport("csv")}
            disabled={!dataset || busy}
          >
            <Download size={18} />
            <span>CSV</span>
          </button>
          <button
            type="button"
            className="icon-button"
            title="Export Parquet"
            onClick={() => onExport("parquet")}
            disabled={!dataset || busy}
          >
            <Download size={18} />
            <span>Parquet</span>
          </button>
        </div>

        <button
          type="button"
          className="icon-button clear-filter-button"
          title="Clear filters"
          onClick={onClearFilters}
          disabled={!filterCount || busy}
        >
          <RotateCcw size={18} />
          {filterCount > 0 ? <span>{filterCount}</span> : null}
        </button>
      </div>

      <div className="dataset-meter" aria-label="Current dataset summary">
        <div>
          <strong>{dataset ? formatCount(dataset.rowCount) : "0"}</strong>
          <span>rows</span>
        </div>
        <div>
          <Columns3 size={14} />
          <span>{formatCount(columnCount)}</span>
        </div>
        <div>
          <Filter size={14} />
          <span>{formatCount(filterCount)}</span>
        </div>
        <div>
          <Sparkles size={14} />
          <span>{formatCount(transformCount)}</span>
        </div>
      </div>
    </header>
  );
}
