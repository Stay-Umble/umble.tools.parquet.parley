mod engine;
mod errors;
mod jobs;
mod models;
mod sql;

use engine::ParleyState;
use errors::ParleyResult;
use models::*;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
fn open_dataset(
    state: State<'_, Mutex<ParleyState>>,
    paths: Vec<String>,
) -> ParleyResult<DatasetSummary> {
    state.lock().expect("state lock").open_dataset(paths)
}

#[tauri::command]
fn get_schema(
    state: State<'_, Mutex<ParleyState>>,
    dataset_id: String,
    recipe: Recipe,
) -> ParleyResult<Vec<ColumnSchema>> {
    state
        .lock()
        .expect("state lock")
        .get_schema(dataset_id, recipe)
}

#[tauri::command]
fn get_rows(
    state: State<'_, Mutex<ParleyState>>,
    request: RowPageRequest,
) -> ParleyResult<RowPage> {
    state.lock().expect("state lock").get_rows(request)
}

#[tauri::command]
fn get_facet_values(
    state: State<'_, Mutex<ParleyState>>,
    request: FacetValuesRequest,
) -> ParleyResult<FacetValuesResponse> {
    state.lock().expect("state lock").get_facet_values(request)
}

#[tauri::command]
fn validate_expression(
    state: State<'_, Mutex<ParleyState>>,
    request: ExpressionValidationRequest,
) -> ParleyResult<ExpressionValidation> {
    state
        .lock()
        .expect("state lock")
        .validate_expression(request)
}

#[tauri::command]
fn apply_recipe(
    state: State<'_, Mutex<ParleyState>>,
    request: ApplyRecipeRequest,
) -> ParleyResult<RecipePreview> {
    state.lock().expect("state lock").apply_recipe(request)
}

#[tauri::command]
fn save_project(
    state: State<'_, Mutex<ParleyState>>,
    request: SaveProjectRequest,
) -> ParleyResult<ProjectDocument> {
    state.lock().expect("state lock").save_project(request)
}

#[tauri::command]
fn load_project(
    state: State<'_, Mutex<ParleyState>>,
    request: LoadProjectRequest,
) -> ParleyResult<ProjectLoadResult> {
    state.lock().expect("state lock").load_project(request)
}

#[tauri::command]
fn export_dataset(
    state: State<'_, Mutex<ParleyState>>,
    request: ExportRequest,
) -> ParleyResult<ExportResult> {
    state.lock().expect("state lock").export_dataset(request)
}

#[tauri::command]
fn get_job_status(
    state: State<'_, Mutex<ParleyState>>,
    request: JobStatusRequest,
) -> ParleyResult<JobStatus> {
    state.lock().expect("state lock").get_job_status(request)
}

#[tauri::command]
fn cancel_job(
    state: State<'_, Mutex<ParleyState>>,
    request: CancelJobRequest,
) -> ParleyResult<JobStatus> {
    state.lock().expect("state lock").cancel_job(request)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(ParleyState::new()))
        .invoke_handler(tauri::generate_handler![
            open_dataset,
            get_schema,
            get_rows,
            get_facet_values,
            validate_expression,
            apply_recipe,
            save_project,
            load_project,
            export_dataset,
            get_job_status,
            cancel_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running Parquet Parley");
}
