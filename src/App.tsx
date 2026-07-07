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
const LAST_DIALOG_FOLDER_KEY = "parquet-parley:last-dialog-folder";

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
        defaultPath: lastDialogFolder(),
        filters: [{ name: "Parquet", extensions: ["parquet", "parq"] }],
      });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (paths.length === 0) {
        return;
      }
      rememberDialogFolder(paths[0], "file");
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
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: lastDialogFolder(),
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      rememberDialogFolder(selected, "directory");
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
        defaultPath: lastDialogFolder(),
        filters: [{ name: "Parley Project", extensions: ["parley"] }],
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      rememberDialogFolder(selected, "file");
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
      const defaultName = `${dataset.displayName}.parley`;
      const outputPath = await save({
        defaultPath: dialogPath(defaultName),
        filters: [{ name: "Parley Project", extensions: ["parley"] }],
      });
      if (!outputPath) {
        return;
      }
      rememberDialogFolder(outputPath, "file");
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
      const defaultName = `${dataset.displayName}.${extension}`;
      const outputPath = await save({
        defaultPath: dialogPath(defaultName),
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      if (!outputPath) {
        return;
      }
      rememberDialogFolder(outputPath, "file");
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

function lastDialogFolder(): string | undefined {
  try {
    return window.localStorage.getItem(LAST_DIALOG_FOLDER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberDialogFolder(path: string, kind: "file" | "directory") {
  const folder = kind === "directory" ? trimTrailingSeparators(path) : parentDirectory(path);
  if (!folder) {
    return;
  }
  try {
    window.localStorage.setItem(LAST_DIALOG_FOLDER_KEY, folder);
  } catch {
    // Ignore private/locked storage; the dialog still works without persistence.
  }
}

function dialogPath(fileName: string): string {
  const folder = lastDialogFolder();
  return folder ? joinPath(folder, fileName) : fileName;
}

function parentDirectory(path: string): string | null {
  const cleanPath = trimTrailingSeparators(path);
  const separatorIndex = Math.max(cleanPath.lastIndexOf("\\"), cleanPath.lastIndexOf("/"));
  if (separatorIndex < 0) {
    return null;
  }
  if (separatorIndex === 0) {
    return cleanPath.slice(0, 1);
  }
  if (/^[A-Za-z]:[\\/]/.test(cleanPath) && separatorIndex === 2) {
    return cleanPath.slice(0, 3);
  }
  return cleanPath.slice(0, separatorIndex);
}

function trimTrailingSeparators(path: string): string {
  if (/^[A-Za-z]:[\\/]$/.test(path)) {
    return path;
  }
  if (/^[\\/]+$/.test(path)) {
    return path.slice(0, 1);
  }
  return path.replace(/[\\/]+$/, "");
}

function joinPath(folder: string, fileName: string): string {
  const separator = folder.includes("\\") ? "\\" : "/";
  return /[\\/]$/.test(folder) ? `${folder}${fileName}` : `${folder}${separator}${fileName}`;
}
