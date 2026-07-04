import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Database } from "lucide-react";
import { CellInspector } from "./components/CellInspector";
import { DataGrid } from "./components/DataGrid";
import { DatasetHeader } from "./components/DatasetHeader";
import { FacetSidebar } from "./components/FacetSidebar";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { TransformPanel } from "./components/TransformPanel";
import {
  exportDataset,
  getRows,
  loadProject,
  openDataset,
  saveProject,
} from "./lib/api";
import { extensionForFormat } from "./lib/format";
import {
  clearFilters,
  emptyRecipe,
  removeColumnFilter,
  replaceSorts,
} from "./lib/recipe";
import type {
  ColumnSchema,
  DatasetSummary,
  Recipe,
  RowPage,
  RowRecord,
  SortSpec,
} from "./types";

const PAGE_SIZE = 500;

interface InspectedCell {
  column: string;
  value: string | null;
  row: RowRecord;
}

export default function App() {
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [recipe, setRecipe] = useState<Recipe>(emptyRecipe);
  const [page, setPage] = useState<RowPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [gridBusy, setGridBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMismatch, setSchemaMismatch] = useState(false);
  const [inspectedCell, setInspectedCell] = useState<InspectedCell | null>(null);
  const [recipePanelOpen, setRecipePanelOpen] = useState(false);

  const columns: ColumnSchema[] = useMemo(
    () => page?.columns ?? dataset?.columns ?? [],
    [dataset?.columns, page?.columns],
  );
  const rows = page?.rows ?? [];
  const totalRows = page?.totalRows ?? dataset?.rowCount ?? 0;

  const refreshRows = useCallback(
    async (nextOffset = offset, nextRecipe = recipe) => {
      if (!dataset) {
        setPage(null);
        return;
      }

      setGridBusy(true);
      setError(null);
      try {
        const nextPage = await getRows({
          datasetId: dataset.id,
          offset: nextOffset,
          limit: PAGE_SIZE,
          recipe: nextRecipe,
        });
        setPage(nextPage);
      } catch (reason) {
        setError(String(reason));
      } finally {
        setGridBusy(false);
      }
    },
    [dataset, offset, recipe],
  );

  useEffect(() => {
    void refreshRows(offset, recipe);
  }, [offset, recipe, refreshRows]);

  async function chooseFiles() {
    setBusy(true);
    setError(null);
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [{ name: "Parquet", extensions: ["parquet", "parq"] }],
      });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (paths.length === 0) {
        return;
      }
      const summary = await openDataset(paths);
      setDataset(summary);
      setRecipe(emptyRecipe);
      setOffset(0);
      setSchemaMismatch(false);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function chooseFolder() {
    setBusy(true);
    setError(null);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      const summary = await openDataset([selected]);
      setDataset(summary);
      setRecipe(emptyRecipe);
      setOffset(0);
      setSchemaMismatch(false);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function chooseProject() {
    setBusy(true);
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Parley Project", extensions: ["parley"] }],
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      const result = await loadProject(selected);
      setDataset(result.dataset);
      setRecipe(result.recipe);
      setOffset(0);
      setSchemaMismatch(result.schemaMismatch);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function persistProject() {
    if (!dataset) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outputPath = await save({
        defaultPath: `${dataset.displayName}.parley`,
        filters: [{ name: "Parley Project", extensions: ["parley"] }],
      });
      if (!outputPath) {
        return;
      }
      await saveProject(dataset.id, outputPath, recipe);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function exportCurrentView(format: "csv" | "parquet") {
    if (!dataset) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const extension = extensionForFormat(format);
      const outputPath = await save({
        defaultPath: `${dataset.displayName}.${extension}`,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      if (!outputPath) {
        return;
      }
      await exportDataset({
        datasetId: dataset.id,
        outputPath,
        format,
        recipe,
      });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  function updateRecipe(nextRecipe: Recipe) {
    setRecipe(nextRecipe);
    setOffset(0);
  }

  function updateSorts(sorts: SortSpec[]) {
    updateRecipe(replaceSorts(recipe, sorts));
  }

  const canPageBack = offset > 0;
  const canPageForward = offset + PAGE_SIZE < totalRows;

  return (
    <div className="app-shell">
      <Toolbar
        dataset={dataset}
        recipe={recipe}
        busy={busy}
        onOpenFiles={chooseFiles}
        onOpenFolder={chooseFolder}
        onOpenProject={chooseProject}
        onSaveProject={persistProject}
        onExport={exportCurrentView}
        onClearFilters={() => updateRecipe(clearFilters(recipe))}
      />

      <main className={recipePanelOpen ? "workspace recipe-open" : "workspace"}>
        <FacetSidebar
          datasetId={dataset?.id ?? null}
          dataset={dataset}
          columns={columns}
          recipe={recipe}
          onRecipeChange={updateRecipe}
        />

        <section className="center-stage">
          {dataset ? (
            <>
              <DatasetHeader
                dataset={dataset}
                columns={columns}
                recipe={recipe}
                totalRows={totalRows}
                offset={offset}
                pageSize={PAGE_SIZE}
                canPageBack={canPageBack}
                canPageForward={canPageForward}
                busy={gridBusy}
                onPageBack={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                onPageForward={() => setOffset(offset + PAGE_SIZE)}
                onRemoveFilter={(column) => updateRecipe(removeColumnFilter(recipe, column))}
                onClearFilters={() => updateRecipe(clearFilters(recipe))}
                recipePanelOpen={recipePanelOpen}
                onToggleRecipePanel={() => setRecipePanelOpen((open) => !open)}
              />
              <DataGrid
                columns={columns}
                rows={rows}
                loading={gridBusy}
                offset={offset}
                onSortChange={updateSorts}
                onInspectCell={(column, value, row) =>
                  setInspectedCell({ column, value, row })
                }
              />
            </>
          ) : (
            <section className="empty-state">
              <div className="empty-icon">
                <Database size={42} />
              </div>
              <h2>Open a Parquet file or folder</h2>
              <p>Local datasets stay on this machine.</p>
              <div className="empty-actions">
                <button type="button" className="tool-button primary" onClick={chooseFiles}>
                  Open File
                </button>
                <button type="button" className="tool-button" onClick={chooseFolder}>
                  Open Folder
                </button>
              </div>
            </section>
          )}
        </section>

        {recipePanelOpen ? (
          <TransformPanel
            datasetId={dataset?.id ?? null}
            columns={columns}
            recipe={recipe}
            onRecipeChange={updateRecipe}
            onClose={() => setRecipePanelOpen(false)}
          />
        ) : null}
      </main>

      <StatusBar
        busy={busy || gridBusy}
        error={error}
        totalRows={totalRows}
        offset={offset}
        pageSize={PAGE_SIZE}
        schemaMismatch={schemaMismatch}
      />

      {inspectedCell ? (
        <CellInspector
          column={inspectedCell.column}
          value={inspectedCell.value}
          row={inspectedCell.row}
          onClose={() => setInspectedCell(null)}
        />
      ) : null}
    </div>
  );
}
