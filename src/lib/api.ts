import { invoke } from "@tauri-apps/api/core";
import type {
  DatasetSummary,
  ExportRequest,
  ExportResult,
  ExpressionValidation,
  ExpressionValidationRequest,
  FacetValuesRequest,
  FacetValuesResponse,
  ProjectLoadResult,
  Recipe,
  RowPage,
  RowPageRequest,
} from "../types";

export function openDataset(paths: string[]): Promise<DatasetSummary> {
  return invoke("open_dataset", { paths });
}

export function getRows(request: RowPageRequest): Promise<RowPage> {
  return invoke("get_rows", { request });
}

export function getFacetValues(
  request: FacetValuesRequest,
): Promise<FacetValuesResponse> {
  return invoke("get_facet_values", { request });
}

export function validateExpression(
  request: ExpressionValidationRequest,
): Promise<ExpressionValidation> {
  return invoke("validate_expression", { request });
}

export function saveProject(
  datasetId: string,
  outputPath: string,
  recipe: Recipe,
): Promise<unknown> {
  return invoke("save_project", {
    request: { datasetId, outputPath, recipe },
  });
}

export function loadProject(path: string): Promise<ProjectLoadResult> {
  return invoke("load_project", { request: { path } });
}

export function exportDataset(request: ExportRequest): Promise<ExportResult> {
  return invoke("export_dataset", { request });
}

