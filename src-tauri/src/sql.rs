use crate::errors::{ParleyError, ParleyResult};
use crate::models::{ColumnSchema, Filter, Recipe, SortDirection, SortSpec, TransformStep};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone)]
pub struct QueryParts {
    pub cte: String,
    pub where_sql: String,
    pub order_sql: String,
    pub columns: Vec<ColumnSchema>,
}

pub fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

pub fn quote_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn source_sql(paths: &[String]) -> ParleyResult<String> {
    if paths.is_empty() {
        return Err(ParleyError::NoParquetFiles);
    }

    if paths.len() == 1 {
        return Ok(format!("read_parquet({})", quote_string(&paths[0])));
    }

    let quoted = paths
        .iter()
        .map(|path| quote_string(path))
        .collect::<Vec<_>>()
        .join(", ");
    Ok(format!("read_parquet([{}])", quoted))
}

pub fn build_query_parts(
    source: &str,
    source_columns: &[ColumnSchema],
    recipe: &Recipe,
    exclude_filter_column: Option<&str>,
) -> ParleyResult<QueryParts> {
    let columns = apply_recipe_to_schema(source_columns, recipe)?;
    let cast_map = cast_targets(recipe);

    let base_select = if source_columns.is_empty() {
        "*".to_string()
    } else {
        source_columns
            .iter()
            .map(|column| {
                let quoted = quote_identifier(&column.name);
                if let Some(target_type) = cast_map.get(&column.name) {
                    format!("TRY_CAST({quoted} AS {target_type}) AS {quoted}")
                } else {
                    quoted
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    };

    let computed = recipe
        .transforms
        .iter()
        .filter_map(|step| match step {
            TransformStep::ComputedColumn { name, expression } => Some((name, expression)),
            _ => None,
        })
        .map(|(name, expression)| format!("{expression} AS {}", quote_identifier(name)))
        .collect::<Vec<_>>();

    let transformed_select = if computed.is_empty() {
        "*".to_string()
    } else {
        format!("*, {}", computed.join(", "))
    };

    let cte = format!(
        "WITH base AS (SELECT * FROM {source}), casted AS (SELECT {base_select} FROM base), transformed AS (SELECT {transformed_select} FROM casted)"
    );

    let filter_sql = build_filter_sql(&recipe.filters, exclude_filter_column);
    let where_sql = if filter_sql.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", filter_sql.join(" AND "))
    };

    let order_sql = build_order_sql(&recipe.sorts);

    Ok(QueryParts {
        cte,
        where_sql,
        order_sql,
        columns,
    })
}

pub fn apply_recipe_to_schema(
    source_columns: &[ColumnSchema],
    recipe: &Recipe,
) -> ParleyResult<Vec<ColumnSchema>> {
    let mut columns = source_columns.to_vec();
    let mut hidden = BTreeSet::new();
    let mut labels = HashMap::new();
    let mut casts = HashMap::new();

    for step in &recipe.transforms {
        match step {
            TransformStep::HideColumn { column } => {
                hidden.insert(column.clone());
            }
            TransformStep::RenameColumn {
                column,
                display_name,
            } => {
                labels.insert(column.clone(), display_name.clone());
            }
            TransformStep::CastColumn {
                column,
                target_type,
            } => {
                let normalized = normalize_type(target_type)?;
                casts.insert(column.clone(), normalized);
            }
            TransformStep::ComputedColumn { name, .. } => {
                if columns.iter().any(|column| column.name == *name) {
                    return Err(ParleyError::InvalidRequest(format!(
                        "Computed column '{name}' already exists."
                    )));
                }
                columns.push(ColumnSchema {
                    name: name.clone(),
                    display_name: labels.get(name).cloned().unwrap_or_else(|| name.clone()),
                    logical_type: "computed".to_string(),
                    nullable: true,
                    nested: false,
                    hidden: false,
                    computed: true,
                });
            }
        }
    }

    for column in &mut columns {
        if hidden.contains(&column.name) {
            column.hidden = true;
        }
        if let Some(label) = labels.get(&column.name) {
            column.display_name = label.clone();
        }
        if let Some(target_type) = casts.get(&column.name) {
            column.logical_type = target_type.clone();
        }
    }

    if let Some(visible_columns) = &recipe.visible_columns {
        let visible = visible_columns.iter().cloned().collect::<BTreeSet<_>>();
        for column in &mut columns {
            column.hidden = !visible.contains(&column.name);
        }
    }

    Ok(columns)
}

pub fn select_list_for_rows(columns: &[ColumnSchema]) -> String {
    columns
        .iter()
        .filter(|column| !column.hidden)
        .map(|column| {
            let quoted = quote_identifier(&column.name);
            format!("CAST({quoted} AS VARCHAR) AS {quoted}")
        })
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn select_list_for_export(columns: &[ColumnSchema]) -> String {
    columns
        .iter()
        .filter(|column| !column.hidden)
        .map(|column| quote_identifier(&column.name))
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn normalize_type(target_type: &str) -> ParleyResult<String> {
    let normalized = target_type.trim().to_uppercase();
    if normalized.is_empty()
        || normalized
            .chars()
            .any(|ch| !(ch.is_ascii_alphanumeric() || matches!(ch, '_' | '(' | ')' | ',' | ' ')))
    {
        return Err(ParleyError::InvalidRequest(format!(
            "Unsupported cast target '{target_type}'."
        )));
    }

    let allowed_prefixes = [
        "VARCHAR",
        "TEXT",
        "BOOLEAN",
        "BOOL",
        "TINYINT",
        "SMALLINT",
        "INTEGER",
        "INT",
        "BIGINT",
        "HUGEINT",
        "FLOAT",
        "DOUBLE",
        "REAL",
        "DECIMAL",
        "DATE",
        "TIME",
        "TIMESTAMP",
        "UUID",
    ];

    if allowed_prefixes
        .iter()
        .any(|prefix| normalized == *prefix || normalized.starts_with(&format!("{prefix}(")))
    {
        Ok(normalized)
    } else {
        Err(ParleyError::InvalidRequest(format!(
            "Unsupported cast target '{target_type}'."
        )))
    }
}

fn cast_targets(recipe: &Recipe) -> HashMap<String, String> {
    recipe
        .transforms
        .iter()
        .filter_map(|step| match step {
            TransformStep::CastColumn {
                column,
                target_type,
            } => normalize_type(target_type)
                .ok()
                .map(|target_type| (column.clone(), target_type)),
            _ => None,
        })
        .collect()
}

fn build_filter_sql(filters: &[Filter], exclude_column: Option<&str>) -> Vec<String> {
    filters
        .iter()
        .filter(|filter| exclude_column != Some(filter.column()))
        .filter_map(|filter| match filter {
            Filter::Set {
                column,
                values,
                include_null,
            } => {
                let quoted = quote_identifier(column);
                let value_sql = if values.is_empty() {
                    None
                } else {
                    Some(format!(
                        "CAST({quoted} AS VARCHAR) IN ({})",
                        values
                            .iter()
                            .map(|value| quote_string(value))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ))
                };
                match (value_sql, include_null) {
                    (Some(sql), true) => Some(format!("({sql} OR {quoted} IS NULL)")),
                    (Some(sql), false) => Some(format!("({sql})")),
                    (None, true) => Some(format!("({quoted} IS NULL)")),
                    (None, false) => None,
                }
            }
            Filter::Range { column, min, max } => {
                let quoted = quote_identifier(column);
                let mut parts = Vec::new();
                if let Some(min) = min.as_ref().filter(|value| !value.trim().is_empty()) {
                    parts.push(format!("{quoted} >= {}", quote_string(min)));
                }
                if let Some(max) = max.as_ref().filter(|value| !value.trim().is_empty()) {
                    parts.push(format!("{quoted} <= {}", quote_string(max)));
                }
                if parts.is_empty() {
                    None
                } else {
                    Some(format!("({})", parts.join(" AND ")))
                }
            }
            Filter::Text {
                column,
                contains,
                case_sensitive,
            } => {
                if contains.trim().is_empty() {
                    return None;
                }
                let operator = if *case_sensitive { "LIKE" } else { "ILIKE" };
                Some(format!(
                    "(CAST({} AS VARCHAR) {operator} {})",
                    quote_identifier(column),
                    quote_string(&format!("%{}%", escape_like(contains)))
                ))
            }
        })
        .collect()
}

fn build_order_sql(sorts: &[SortSpec]) -> String {
    if sorts.is_empty() {
        return String::new();
    }

    let parts = sorts
        .iter()
        .map(|sort| {
            let direction = match sort.direction {
                SortDirection::Asc => "ASC",
                SortDirection::Desc => "DESC",
            };
            format!("{} {direction} NULLS LAST", quote_identifier(&sort.column))
        })
        .collect::<Vec<_>>();

    format!(" ORDER BY {}", parts.join(", "))
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_identifiers_and_strings() {
        assert_eq!(quote_identifier("a\"b"), "\"a\"\"b\"");
        assert_eq!(quote_string("can't"), "'can''t'");
    }

    #[test]
    fn rejects_unsafe_cast_type() {
        assert!(normalize_type("VARCHAR").is_ok());
        assert!(normalize_type("DECIMAL(18, 2)").is_ok());
        assert!(normalize_type("VARCHAR); DROP TABLE x; --").is_err());
    }

    #[test]
    fn set_filter_ors_values_with_nulls() {
        let recipe = Recipe {
            filters: vec![Filter::Set {
                column: "status".to_string(),
                values: vec!["new".to_string(), "done".to_string()],
                include_null: true,
            }],
            ..Recipe::default()
        };

        let source_columns = vec![ColumnSchema {
            name: "status".to_string(),
            display_name: "status".to_string(),
            logical_type: "VARCHAR".to_string(),
            nullable: true,
            nested: false,
            hidden: false,
            computed: false,
        }];

        let parts = build_query_parts("read_parquet('x.parquet')", &source_columns, &recipe, None)
            .expect("query parts");
        assert!(parts
            .where_sql
            .contains("CAST(\"status\" AS VARCHAR) IN ('new', 'done')"));
        assert!(parts.where_sql.contains("\"status\" IS NULL"));
    }
}
