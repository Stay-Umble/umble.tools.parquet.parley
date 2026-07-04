use crate::errors::{ParleyError, ParleyResult};
use crate::jobs::JobRegistry;
use crate::models::*;
use crate::sql::{
    apply_recipe_to_schema, build_query_parts, quote_identifier, quote_string,
    select_list_for_export, select_list_for_rows, source_sql,
};
use duckdb::Connection;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone)]
struct DatasetContext {
    summary: DatasetSummary,
    source_sql: String,
}

#[derive(Debug, Default)]
pub struct ParleyState {
    datasets: HashMap<String, DatasetContext>,
    jobs: JobRegistry,
}

impl ParleyState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open_dataset(&mut self, paths: Vec<String>) -> ParleyResult<DatasetSummary> {
        let files = expand_parquet_paths(&paths)?;
        let source = source_sql(&files)?;
        let conn = open_connection()?;
        let columns = describe_schema(&conn, &source).map_err(|error| {
            ParleyError::SchemaMismatch(error.to_string().replace("DuckDB error: ", ""))
        })?;
        let row_count = count_rows(&conn, &source, &columns, &Recipe::default())?;
        let display_name = dataset_display_name(&files);
        let schema_fingerprint = schema_fingerprint(&columns);
        let id = Uuid::new_v4().to_string();

        let summary = DatasetSummary {
            id: id.clone(),
            display_name,
            paths: files,
            row_count,
            columns,
            schema_fingerprint,
        };

        self.datasets.insert(
            id,
            DatasetContext {
                summary: summary.clone(),
                source_sql: source,
            },
        );

        Ok(summary)
    }

    pub fn get_schema(
        &self,
        dataset_id: String,
        recipe: Recipe,
    ) -> ParleyResult<Vec<ColumnSchema>> {
        let dataset = self.dataset(&dataset_id)?;
        apply_recipe_to_schema(&dataset.summary.columns, &recipe)
    }

    pub fn get_rows(&self, request: RowPageRequest) -> ParleyResult<RowPage> {
        let dataset = self.dataset(&request.dataset_id)?;
        let limit = request.limit.clamp(1, 2_000);
        let conn = open_connection()?;
        let parts = build_query_parts(
            &dataset.source_sql,
            &dataset.summary.columns,
            &request.recipe,
            None,
        )?;
        let select_list = select_list_for_rows(&parts.columns);
        if select_list.is_empty() {
            return Ok(RowPage {
                rows: Vec::new(),
                total_rows: count_rows_from_parts(&conn, &parts)?,
                offset: request.offset,
                limit,
                columns: parts.columns,
            });
        }

        let total_rows = count_rows_from_parts(&conn, &parts)?;
        let sql = format!(
            "{} SELECT {} FROM transformed{}{} LIMIT {} OFFSET {}",
            parts.cte, select_list, parts.where_sql, parts.order_sql, limit, request.offset
        );
        let visible_columns = parts
            .columns
            .iter()
            .filter(|column| !column.hidden)
            .cloned()
            .collect::<Vec<_>>();
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query([])?;
        let mut page_rows = Vec::new();

        while let Some(row) = rows.next()? {
            let mut record = BTreeMap::new();
            for (index, column) in visible_columns.iter().enumerate() {
                let value: Option<String> = row.get(index)?;
                record.insert(
                    column.name.clone(),
                    value.map(Value::String).unwrap_or(Value::Null),
                );
            }
            page_rows.push(record);
        }

        Ok(RowPage {
            rows: page_rows,
            total_rows,
            offset: request.offset,
            limit,
            columns: parts.columns,
        })
    }

    pub fn get_facet_values(
        &self,
        request: FacetValuesRequest,
    ) -> ParleyResult<FacetValuesResponse> {
        let dataset = self.dataset(&request.dataset_id)?;
        let limit = request.limit.unwrap_or(50).clamp(1, 500);
        let conn = open_connection()?;
        let parts = build_query_parts(
            &dataset.source_sql,
            &dataset.summary.columns,
            &request.recipe,
            Some(&request.column),
        )?;
        let quoted = quote_identifier(&request.column);
        let label_expr = format!("CAST({quoted} AS VARCHAR)");
        let mut extra_filters = Vec::new();

        if let Some(search) = request
            .search
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            extra_filters.push(format!(
                "{label_expr} ILIKE {}",
                quote_string(&format!("%{}%", search))
            ));
        }

        let facet_where = combine_where(&parts.where_sql, &extra_filters);
        let sql = format!(
            "{} SELECT {quoted} IS NULL AS is_null, {label_expr} AS label, COUNT(*) AS value_count \
             FROM transformed{facet_where} GROUP BY is_null, label \
             ORDER BY value_count DESC, label ASC LIMIT {}",
            parts.cte,
            limit + 1
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query([])?;
        let mut values = Vec::new();

        while let Some(row) = rows.next()? {
            let is_null: bool = row.get(0)?;
            let label: Option<String> = row.get(1)?;
            let count: i64 = row.get(2)?;
            let display = if is_null {
                "(null)".to_string()
            } else {
                label.clone().unwrap_or_default()
            };
            values.push(FacetValue {
                value: if is_null { None } else { label },
                label: display,
                count: count.max(0) as u64,
            });
        }

        let has_more = values.len() > limit as usize;
        values.truncate(limit as usize);
        let total_distinct = distinct_count(&conn, &parts, &quoted)?;

        Ok(FacetValuesResponse {
            column: request.column,
            values,
            has_more,
            total_distinct: Some(total_distinct),
        })
    }

    pub fn validate_expression(
        &self,
        request: ExpressionValidationRequest,
    ) -> ParleyResult<ExpressionValidation> {
        let dataset = self.dataset(&request.dataset_id)?;
        let conn = open_connection()?;
        let parts = build_query_parts(
            &dataset.source_sql,
            &dataset.summary.columns,
            &request.recipe,
            None,
        )?;
        let sql = format!(
            "{} SELECT {} FROM transformed LIMIT 0",
            parts.cte, request.expression
        );

        match conn.prepare(&sql) {
            Ok(_) => Ok(ExpressionValidation {
                valid: true,
                error: None,
            }),
            Err(error) => Ok(ExpressionValidation {
                valid: false,
                error: Some(error.to_string()),
            }),
        }
    }

    pub fn apply_recipe(&self, request: ApplyRecipeRequest) -> ParleyResult<RecipePreview> {
        let dataset = self.dataset(&request.dataset_id)?;
        let conn = open_connection()?;
        let parts = build_query_parts(
            &dataset.source_sql,
            &dataset.summary.columns,
            &request.recipe,
            None,
        )?;
        let total_rows = count_rows_from_parts(&conn, &parts)?;

        Ok(RecipePreview {
            total_rows,
            columns: parts.columns,
        })
    }

    pub fn save_project(&self, request: SaveProjectRequest) -> ParleyResult<ProjectDocument> {
        let dataset = self.dataset(&request.dataset_id)?;
        let project = ProjectDocument {
            version: 1,
            dataset_paths: dataset.summary.paths.clone(),
            schema_fingerprint: dataset.summary.schema_fingerprint.clone(),
            recipe: request.recipe,
        };
        let json = serde_json::to_string_pretty(&project)?;
        fs::write(&request.output_path, json)?;
        Ok(project)
    }

    pub fn load_project(&mut self, request: LoadProjectRequest) -> ParleyResult<ProjectLoadResult> {
        let contents = fs::read_to_string(&request.path)?;
        let project: ProjectDocument = serde_json::from_str(&contents)?;
        let dataset = self.open_dataset(project.dataset_paths.clone())?;
        let schema_mismatch = dataset.schema_fingerprint != project.schema_fingerprint;

        Ok(ProjectLoadResult {
            dataset,
            recipe: project.recipe,
            schema_mismatch,
        })
    }

    pub fn export_dataset(&mut self, request: ExportRequest) -> ParleyResult<ExportResult> {
        let job_id = self
            .jobs
            .insert(JobState::Running, Some("Exporting dataset.".to_string()));
        let result = self.export_dataset_inner(&request, &job_id);

        match result {
            Ok(export) => {
                self.jobs.complete(
                    &job_id,
                    Some(format!("Exported {} rows.", export.rows_exported)),
                );
                Ok(export)
            }
            Err(error) => {
                self.jobs.fail(&job_id, error.to_string());
                Err(error)
            }
        }
    }

    pub fn get_job_status(&self, request: JobStatusRequest) -> ParleyResult<JobStatus> {
        self.jobs
            .get(&request.job_id)
            .ok_or_else(|| ParleyError::InvalidRequest("Unknown job id.".to_string()))
    }

    pub fn cancel_job(&mut self, request: CancelJobRequest) -> ParleyResult<JobStatus> {
        self.jobs
            .cancel(&request.job_id)
            .ok_or_else(|| ParleyError::InvalidRequest("Unknown job id.".to_string()))
    }

    fn export_dataset_inner(
        &self,
        request: &ExportRequest,
        job_id: &str,
    ) -> ParleyResult<ExportResult> {
        let dataset = self.dataset(&request.dataset_id)?;
        let conn = open_connection()?;
        let parts = build_query_parts(
            &dataset.source_sql,
            &dataset.summary.columns,
            &request.recipe,
            None,
        )?;
        let rows_exported = count_rows_from_parts(&conn, &parts)?;
        let select_list = select_list_for_export(&parts.columns);
        if select_list.is_empty() {
            return Err(ParleyError::InvalidRequest(
                "At least one visible column is required for export.".to_string(),
            ));
        }
        let body_sql = format!(
            "{} SELECT {} FROM transformed{}{}",
            parts.cte, select_list, parts.where_sql, parts.order_sql
        );
        let copy_options = match request.format {
            ExportFormat::Csv => "(FORMAT CSV, HEADER TRUE)",
            ExportFormat::Parquet => "(FORMAT PARQUET)",
        };
        let sql = format!(
            "COPY ({body_sql}) TO {} {copy_options}",
            quote_string(&request.output_path)
        );
        conn.execute_batch(&sql)?;

        Ok(ExportResult {
            output_path: request.output_path.clone(),
            rows_exported,
            job_id: job_id.to_string(),
        })
    }

    fn dataset(&self, dataset_id: &str) -> ParleyResult<&DatasetContext> {
        self.datasets
            .get(dataset_id)
            .ok_or(ParleyError::DatasetNotFound)
    }
}

fn open_connection() -> ParleyResult<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(
        "SET preserve_insertion_order = false; SET threads TO 4; SET enable_progress_bar = false;",
    )?;
    Ok(conn)
}

fn describe_schema(conn: &Connection, source: &str) -> ParleyResult<Vec<ColumnSchema>> {
    let sql = format!("DESCRIBE SELECT * FROM {source}");
    let mut stmt = conn.prepare(&sql)?;
    let columns = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let logical_type: String = row.get(1)?;
            let nullable_text: Option<String> = row.get(2)?;
            let upper_type = logical_type.to_uppercase();
            Ok(ColumnSchema {
                display_name: name.clone(),
                name,
                nullable: nullable_text
                    .map(|value| value.eq_ignore_ascii_case("YES"))
                    .unwrap_or(true),
                nested: ["STRUCT", "LIST", "MAP", "UNION", "[]"]
                    .iter()
                    .any(|marker| upper_type.contains(marker)),
                logical_type,
                hidden: false,
                computed: false,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(columns)
}

fn count_rows(
    conn: &Connection,
    source: &str,
    columns: &[ColumnSchema],
    recipe: &Recipe,
) -> ParleyResult<u64> {
    let parts = build_query_parts(source, columns, recipe, None)?;
    count_rows_from_parts(conn, &parts)
}

fn count_rows_from_parts(conn: &Connection, parts: &crate::sql::QueryParts) -> ParleyResult<u64> {
    let sql = format!(
        "{} SELECT COUNT(*) FROM transformed{}",
        parts.cte, parts.where_sql
    );
    let count: i64 = conn.query_row(&sql, [], |row| row.get(0))?;
    Ok(count.max(0) as u64)
}

fn distinct_count(
    conn: &Connection,
    parts: &crate::sql::QueryParts,
    quoted_column: &str,
) -> ParleyResult<u64> {
    let sql = format!(
        "{} SELECT COUNT(DISTINCT CAST({quoted_column} AS VARCHAR)) FROM transformed{}",
        parts.cte, parts.where_sql
    );
    let count: i64 = conn.query_row(&sql, [], |row| row.get(0))?;
    Ok(count.max(0) as u64)
}

fn combine_where(base_where: &str, extra_filters: &[String]) -> String {
    if extra_filters.is_empty() {
        return base_where.to_string();
    }

    if base_where.is_empty() {
        format!(" WHERE {}", extra_filters.join(" AND "))
    } else {
        format!(
            "{} AND {}",
            base_where,
            extra_filters
                .iter()
                .map(|filter| format!("({filter})"))
                .collect::<Vec<_>>()
                .join(" AND ")
        )
    }
}

fn expand_parquet_paths(paths: &[String]) -> ParleyResult<Vec<String>> {
    let mut files = Vec::new();
    for path in paths {
        let path = PathBuf::from(path);
        if path.is_dir() {
            collect_parquet_files(&path, &mut files)?;
        } else if is_parquet_file(&path) {
            files.push(canonical_string(&path)?);
        }
    }

    files.sort();
    files.dedup();

    if files.is_empty() {
        Err(ParleyError::NoParquetFiles)
    } else {
        Ok(files)
    }
}

fn collect_parquet_files(path: &Path, files: &mut Vec<String>) -> ParleyResult<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_parquet_files(&path, files)?;
        } else if is_parquet_file(&path) {
            files.push(canonical_string(&path)?);
        }
    }
    Ok(())
}

fn is_parquet_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "parquet" | "parq"))
        .unwrap_or(false)
}

fn canonical_string(path: &Path) -> ParleyResult<String> {
    Ok(path.canonicalize()?.to_string_lossy().to_string())
}

fn dataset_display_name(files: &[String]) -> String {
    if files.len() == 1 {
        Path::new(&files[0])
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Parquet dataset")
            .to_string()
    } else {
        format!("{} Parquet files", files.len())
    }
}

fn schema_fingerprint(columns: &[ColumnSchema]) -> String {
    let mut hasher = Sha256::new();
    for column in columns {
        hasher.update(column.name.as_bytes());
        hasher.update([0]);
        hasher.update(column.logical_type.as_bytes());
        hasher.update([0]);
        hasher.update(if column.nullable { [1] } else { [0] });
    }
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_fixture(path: &Path, start: i64, end: i64) {
        let conn = Connection::open_in_memory().expect("connection");
        let sql = format!(
            "COPY (
                SELECT
                    i AS id,
                    CASE WHEN i % 3 = 0 THEN 'new' WHEN i % 3 = 1 THEN 'done' ELSE NULL END AS status,
                    i * 10 AS amount,
                    STRUCT_PACK(code := i, label := 'nested') AS details
                FROM range({start}, {end}) AS t(i)
            ) TO {} (FORMAT PARQUET)",
            quote_string(&path.to_string_lossy())
        );
        conn.execute_batch(&sql).expect("write parquet fixture");
    }

    #[test]
    fn opens_single_parquet_file_and_pages_rows() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("sample.parquet");
        write_fixture(&path, 0, 100);

        let mut state = ParleyState::new();
        let dataset = state
            .open_dataset(vec![path.to_string_lossy().to_string()])
            .expect("open dataset");
        assert_eq!(dataset.row_count, 100);
        assert!(dataset
            .columns
            .iter()
            .any(|column| column.name == "details" && column.nested));

        let page = state
            .get_rows(RowPageRequest {
                dataset_id: dataset.id,
                offset: 10,
                limit: 5,
                recipe: Recipe::default(),
            })
            .expect("rows");
        assert_eq!(page.rows.len(), 5);
        assert_eq!(page.total_rows, 100);
    }

    #[test]
    fn filters_and_exports_parquet() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("sample.parquet");
        let output = dir.path().join("filtered.parquet");
        write_fixture(&path, 0, 30);

        let mut state = ParleyState::new();
        let dataset = state
            .open_dataset(vec![path.to_string_lossy().to_string()])
            .expect("open dataset");
        let recipe = Recipe {
            filters: vec![Filter::Set {
                column: "status".to_string(),
                values: vec!["new".to_string()],
                include_null: false,
            }],
            transforms: vec![TransformStep::ComputedColumn {
                name: "amount_plus_one".to_string(),
                expression: "\"amount\" + 1".to_string(),
            }],
            ..Recipe::default()
        };

        let page = state
            .get_rows(RowPageRequest {
                dataset_id: dataset.id.clone(),
                offset: 0,
                limit: 50,
                recipe: recipe.clone(),
            })
            .expect("filtered rows");
        assert_eq!(page.total_rows, 10);
        assert!(page
            .columns
            .iter()
            .any(|column| column.name == "amount_plus_one" && column.computed));

        let export = state
            .export_dataset(ExportRequest {
                dataset_id: dataset.id,
                output_path: output.to_string_lossy().to_string(),
                format: ExportFormat::Parquet,
                recipe,
            })
            .expect("export");
        assert_eq!(export.rows_exported, 10);
        assert!(output.exists());
    }

    #[test]
    fn loads_project_and_reports_schema_mismatch() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("sample.parquet");
        let project_path = dir.path().join("sample.parley");
        write_fixture(&path, 0, 10);

        let mut state = ParleyState::new();
        let dataset = state
            .open_dataset(vec![path.to_string_lossy().to_string()])
            .expect("open dataset");
        state
            .save_project(SaveProjectRequest {
                dataset_id: dataset.id,
                output_path: project_path.to_string_lossy().to_string(),
                recipe: Recipe::default(),
            })
            .expect("save project");

        let loaded = state
            .load_project(LoadProjectRequest {
                path: project_path.to_string_lossy().to_string(),
            })
            .expect("load project");
        assert!(!loaded.schema_mismatch);
    }
}
