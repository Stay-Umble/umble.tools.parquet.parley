export interface DatasetSummary {
  id: string;
  displayName: string;
  paths: string[];
  rowCount: number;
  columns: ColumnSchema[];
  schemaFingerprint: string;
}

export interface ColumnSchema {
  name: string;
  displayName: string;
  logicalType: string;
  nullable: boolean;
  nested: boolean;
  hidden: boolean;
  computed: boolean;
}

export interface Recipe {
  filters: Filter[];
  sorts: SortSpec[];
  transforms: TransformStep[];
  visibleColumns?: string[] | null;
}

export type Filter =
  | {
      kind: "set";
      column: string;
      values: string[];
      includeNull: boolean;
    }
  | {
      kind: "range";
      column: string;
      min?: string | null;
      max?: string | null;
    }
  | {
      kind: "text";
      column: string;
      contains: string;
      caseSensitive: boolean;
    };

export interface SortSpec {
  column: string;
  direction: "asc" | "desc";
}

export type TransformStep =
  | { kind: "hideColumn"; column: string }
  | { kind: "renameColumn"; column: string; displayName: string }
  | { kind: "castColumn"; column: string; targetType: string }
  | { kind: "computedColumn"; name: string; expression: string };

export interface RowPageRequest {
  datasetId: string;
  offset: number;
  limit: number;
  recipe: Recipe;
}

export interface RowPage {
  rows: RowRecord[];
  totalRows: number;
  offset: number;
  limit: number;
  columns: ColumnSchema[];
}

export type RowRecord = Record<string, string | null>;

export interface FacetValuesRequest {
  datasetId: string;
  column: string;
  search?: string | null;
  limit?: number | null;
  includeValues?: boolean | null;
  recipe: Recipe;
}

export interface FacetValue {
  value: string | null;
  label: string;
  count: number;
}

export interface FacetValuesResponse {
  column: string;
  values: FacetValue[];
  hasMore: boolean;
  totalDistinct?: number | null;
  minValue?: string | null;
  maxValue?: string | null;
}

export interface ExpressionValidationRequest {
  datasetId: string;
  expression: string;
  recipe: Recipe;
}

export interface ExpressionValidation {
  valid: boolean;
  error?: string | null;
}

export interface ProjectLoadResult {
  dataset: DatasetSummary;
  recipe: Recipe;
  schemaMismatch: boolean;
}

export interface ExportRequest {
  datasetId: string;
  outputPath: string;
  format: "csv" | "parquet";
  recipe: Recipe;
}

export interface ExportResult {
  outputPath: string;
  rowsExported: number;
  jobId: string;
}
