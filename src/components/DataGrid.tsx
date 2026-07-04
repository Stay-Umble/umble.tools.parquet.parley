import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  type CellDoubleClickedEvent,
  type ColDef,
  type ITooltipParams,
  type SortChangedEvent,
  type ValueGetterParams,
  ModuleRegistry,
} from "ag-grid-community";
import type { ColumnSchema, RowRecord, SortSpec } from "../types";

ModuleRegistry.registerModules([AllCommunityModule]);

interface DataGridProps {
  columns: ColumnSchema[];
  rows: RowRecord[];
  loading: boolean;
  offset: number;
  onSortChange: (sorts: SortSpec[]) => void;
  onInspectCell: (column: string, value: string | null, row: RowRecord) => void;
}

export function DataGrid({
  columns,
  rows,
  loading,
  offset,
  onSortChange,
  onInspectCell,
}: DataGridProps) {
  const columnDefs = useMemo<ColDef<RowRecord>[]>(
    () => [
      {
        colId: "__rowNumber",
        headerName: "#",
        width: 72,
        minWidth: 64,
        maxWidth: 84,
        pinned: "left",
        sortable: false,
        resizable: false,
        suppressMovable: true,
        valueGetter: (params) =>
          params.node?.rowIndex == null ? "" : offset + params.node.rowIndex + 1,
        cellClass: "row-number-cell",
        headerClass: "row-number-header",
      },
      ...columns
        .filter((column) => !column.hidden)
        .map((column) => {
          const numeric = isNumericColumn(column);
          const cellClasses = [
            numeric ? "numeric-cell" : "",
            column.nested ? "nested-cell" : "",
            column.computed ? "computed-cell" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const headerClasses = [
            numeric ? "numeric-header" : "",
            column.computed ? "computed-header" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return {
            colId: column.name,
            headerName: column.displayName,
            sortable: true,
            resizable: true,
            minWidth: column.nested ? 240 : numeric ? 132 : 160,
            flex: column.nested ? 1.35 : numeric ? 0.85 : 1,
            valueGetter: (params: ValueGetterParams<RowRecord>) =>
              params.data?.[column.name] ?? null,
            tooltipValueGetter: (params: ITooltipParams<RowRecord>) =>
              params.data?.[column.name] ?? "",
            cellClass: cellClasses || undefined,
            headerClass: headerClasses || undefined,
          };
        }),
    ],
    [columns, offset],
  );

  const defaultColDef = useMemo<ColDef<RowRecord>>(
    () => ({
      filter: false,
      suppressHeaderMenuButton: true,
      wrapText: false,
      autoHeight: false,
    }),
    [],
  );

  function handleSortChanged(event: SortChangedEvent<RowRecord>) {
    const sorts = event.api
      .getColumnState()
      .filter((column) => column.sort)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map((column) => ({
        column: column.colId,
        direction: column.sort === "desc" ? "desc" : "asc",
      })) satisfies SortSpec[];
    onSortChange(sorts);
  }

  function handleCellDoubleClicked(event: CellDoubleClickedEvent<RowRecord>) {
    if (!event.column || !event.data) {
      return;
    }
    const column = event.column.getColId();
    if (column.startsWith("__")) {
      return;
    }
    onInspectCell(column, event.data[column] ?? null, event.data);
  }

  return (
    <section className="grid-shell" aria-label="Parquet data grid">
      <div className="ag-theme-quartz parquet-grid">
        <AgGridReact<RowRecord>
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          loading={loading}
          animateRows={false}
          rowHeight={34}
          headerHeight={38}
          suppressFieldDotNotation
          suppressDragLeaveHidesColumns
          onSortChanged={handleSortChanged}
          onCellDoubleClicked={handleCellDoubleClicked}
        />
      </div>
    </section>
  );
}

function isNumericColumn(column: ColumnSchema): boolean {
  return /INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGEINT|SMALLINT|TINYINT|BIGINT/i.test(
    column.logicalType,
  );
}
