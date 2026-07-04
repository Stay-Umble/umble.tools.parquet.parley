use thiserror::Error;

pub type ParleyResult<T> = Result<T, ParleyError>;

#[derive(Debug, Error)]
pub enum ParleyError {
    #[error("No Parquet files were found in the selected location.")]
    NoParquetFiles,
    #[error("Dataset was not found. Reopen the file or project and try again.")]
    DatasetNotFound,
    #[error("The selected files do not have a compatible Parquet schema: {0}")]
    SchemaMismatch(String),
    #[error("Invalid request: {0}")]
    InvalidRequest(String),
    #[error("DuckDB error: {0}")]
    DuckDb(#[from] duckdb::Error),
    #[error("File error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Project file error: {0}")]
    Serde(#[from] serde_json::Error),
}

impl serde::Serialize for ParleyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
