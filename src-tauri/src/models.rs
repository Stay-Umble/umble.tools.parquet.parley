use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetSummary {
    pub id: String,
    pub display_name: String,
    pub paths: Vec<String>,
    pub row_count: u64,
    pub columns: Vec<ColumnSchema>,
    pub schema_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnSchema {
    pub name: String,
    pub display_name: String,
    pub logical_type: String,
    pub nullable: bool,
    pub nested: bool,
    pub hidden: bool,
    pub computed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default)]
    pub sorts: Vec<SortSpec>,
    #[serde(default)]
    pub transforms: Vec<TransformStep>,
    #[serde(default)]
    pub visible_columns: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Filter {
    Set {
        column: String,
        #[serde(default)]
        values: Vec<String>,
        #[serde(default)]
        include_null: bool,
    },
    Range {
        column: String,
        min: Option<String>,
        max: Option<String>,
    },
    Text {
        column: String,
        contains: String,
        #[serde(default)]
        case_sensitive: bool,
    },
}

impl Filter {
    pub fn column(&self) -> &str {
        match self {
            Filter::Set { column, .. }
            | Filter::Range { column, .. }
            | Filter::Text { column, .. } => column,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SortSpec {
    pub column: String,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TransformStep {
    HideColumn {
        column: String,
    },
    RenameColumn {
        column: String,
        display_name: String,
    },
    CastColumn {
        column: String,
        target_type: String,
    },
    ComputedColumn {
        name: String,
        expression: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowPageRequest {
    pub dataset_id: String,
    pub offset: u64,
    pub limit: u32,
    #[serde(default)]
    pub recipe: Recipe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowPage {
    pub rows: Vec<BTreeMap<String, Value>>,
    pub total_rows: u64,
    pub offset: u64,
    pub limit: u32,
    pub columns: Vec<ColumnSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacetValuesRequest {
    pub dataset_id: String,
    pub column: String,
    pub search: Option<String>,
    pub limit: Option<u32>,
    pub include_values: Option<bool>,
    #[serde(default)]
    pub recipe: Recipe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacetValue {
    pub value: Option<String>,
    pub label: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacetValuesResponse {
    pub column: String,
    pub values: Vec<FacetValue>,
    pub has_more: bool,
    pub total_distinct: Option<u64>,
    pub min_value: Option<String>,
    pub max_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionValidationRequest {
    pub dataset_id: String,
    pub expression: String,
    #[serde(default)]
    pub recipe: Recipe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionValidation {
    pub valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRecipeRequest {
    pub dataset_id: String,
    #[serde(default)]
    pub recipe: Recipe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipePreview {
    pub total_rows: u64,
    pub columns: Vec<ColumnSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectRequest {
    pub dataset_id: String,
    pub output_path: String,
    #[serde(default)]
    pub recipe: Recipe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadProjectRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub version: u32,
    pub dataset_paths: Vec<String>,
    pub schema_fingerprint: String,
    #[serde(default)]
    pub recipe: Recipe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLoadResult {
    pub dataset: DatasetSummary,
    pub recipe: Recipe,
    pub schema_mismatch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub dataset_id: String,
    pub output_path: String,
    pub format: ExportFormat,
    #[serde(default)]
    pub recipe: Recipe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Parquet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub rows_exported: u64,
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatusRequest {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelJobRequest {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatus {
    pub job_id: String,
    pub state: JobState,
    pub message: Option<String>,
    pub progress: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobState {
    Pending,
    Running,
    Completed,
    Cancelled,
    Failed,
}
