import { useMemo, useState } from "react";
import { Check, Code2, Eye, EyeOff, Plus, Sparkles, Trash2, X } from "lucide-react";
import { validateExpression } from "../lib/api";
import {
  removeTransform,
  upsertTransform,
} from "../lib/recipe";
import type { ColumnSchema, Recipe, TransformStep } from "../types";

interface TransformPanelProps {
  datasetId: string | null;
  columns: ColumnSchema[];
  recipe: Recipe;
  onRecipeChange: (recipe: Recipe) => void;
  onClose?: () => void;
}

const CAST_TYPES = [
  "",
  "VARCHAR",
  "BOOLEAN",
  "INTEGER",
  "BIGINT",
  "DOUBLE",
  "DECIMAL(18, 2)",
  "DATE",
  "TIMESTAMP",
];

export function TransformPanel({
  datasetId,
  columns,
  recipe,
  onRecipeChange,
  onClose,
}: TransformPanelProps) {
  const [computedName, setComputedName] = useState("");
  const [computedExpression, setComputedExpression] = useState("");
  const [expressionError, setExpressionError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const transformLookup = useMemo(() => {
    const hidden = new Set<string>();
    const labels = new Map<string, string>();
    const casts = new Map<string, string>();
    const computed: TransformStep[] = [];

    for (const step of recipe.transforms) {
      if (step.kind === "hideColumn") {
        hidden.add(step.column);
      }
      if (step.kind === "renameColumn") {
        labels.set(step.column, step.displayName);
      }
      if (step.kind === "castColumn") {
        casts.set(step.column, step.targetType);
      }
      if (step.kind === "computedColumn") {
        computed.push(step);
      }
    }

    return { hidden, labels, casts, computed };
  }, [recipe.transforms]);

  async function addComputedColumn() {
    if (!datasetId || !computedName.trim() || !computedExpression.trim()) {
      return;
    }

    setValidating(true);
    setExpressionError(null);
    try {
      const result = await validateExpression({
        datasetId,
        expression: computedExpression,
        recipe,
      });
      if (!result.valid) {
        setExpressionError(result.error ?? "Expression is not valid.");
        return;
      }
      onRecipeChange(
        upsertTransform(recipe, {
          kind: "computedColumn",
          name: computedName.trim(),
          expression: computedExpression.trim(),
        }),
      );
      setComputedName("");
      setComputedExpression("");
    } catch (error) {
      setExpressionError(String(error));
    } finally {
      setValidating(false);
    }
  }

  return (
    <aside className="transform-panel" aria-label="Transforms">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">Recipe</span>
          <h2>Transforms</h2>
        </div>
        <div className="panel-heading-actions">
          <span className="panel-count">{recipe.transforms.length}</span>
          {onClose ? (
            <button
              type="button"
              className="icon-button subtle"
              title="Close recipe panel"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="transform-section">
        <div className="section-title">
          <Eye size={15} />
          <h3>Columns</h3>
        </div>
        {columns.length === 0 ? <div className="soft-state">No dataset open</div> : null}
        <div className="column-transform-list">
          {columns
            .filter((column) => !column.computed)
            .map((column) => {
              const isHidden = transformLookup.hidden.has(column.name) || column.hidden;
              return (
                <div className="column-transform" key={column.name}>
                  <button
                    type="button"
                    className="icon-button subtle"
                    title={isHidden ? "Show column" : "Hide column"}
                    onClick={() =>
                      onRecipeChange(
                        isHidden
                          ? removeTransform(
                              recipe,
                              (step) => step.kind === "hideColumn" && step.column === column.name,
                            )
                          : upsertTransform(recipe, {
                              kind: "hideColumn",
                              column: column.name,
                            }),
                      )
                    }
                  >
                    {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <div className="column-transform-main">
                    <strong title={column.name}>{column.name}</strong>
                    <input
                      value={transformLookup.labels.get(column.name) ?? column.displayName}
                      onChange={(event) =>
                        onRecipeChange(
                          upsertTransform(recipe, {
                            kind: "renameColumn",
                            column: column.name,
                            displayName: event.target.value,
                          }),
                        )
                      }
                      aria-label={`Display label for ${column.name}`}
                    />
                  </div>
                  <select
                    value={transformLookup.casts.get(column.name) ?? ""}
                    onChange={(event) =>
                      event.target.value
                        ? onRecipeChange(
                            upsertTransform(recipe, {
                              kind: "castColumn",
                              column: column.name,
                              targetType: event.target.value,
                            }),
                          )
                        : onRecipeChange(
                            removeTransform(
                              recipe,
                              (step) =>
                                step.kind === "castColumn" && step.column === column.name,
                            ),
                          )
                    }
                    aria-label={`Cast ${column.name}`}
                  >
                    {CAST_TYPES.map((type) => (
                      <option value={type} key={type || "none"}>
                        {type || column.logicalType}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
        </div>
      </div>

      <div className="transform-section">
        <div className="section-title">
          <Code2 size={15} />
          <h3>Computed</h3>
        </div>
        <div className="computed-form">
          <input
            value={computedName}
            onChange={(event) => setComputedName(event.target.value)}
            placeholder="Column name"
          />
          <textarea
            value={computedExpression}
            onChange={(event) => setComputedExpression(event.target.value)}
            placeholder='"amount" * 1.2'
            rows={3}
          />
          <button
            type="button"
            className="tool-button primary"
            onClick={addComputedColumn}
            disabled={!datasetId || validating || !computedName || !computedExpression}
          >
            {validating ? <Check size={16} /> : <Plus size={16} />}
            <span>Add</span>
          </button>
          {expressionError ? <div className="error-state">{expressionError}</div> : null}
        </div>
        <div className="computed-list">
          {transformLookup.computed.length === 0 ? (
            <div className="soft-state compact">
              <Sparkles size={14} />
              <span>No computed columns</span>
            </div>
          ) : null}
          {transformLookup.computed.map((step) =>
            step.kind === "computedColumn" ? (
              <div className="computed-row" key={step.name}>
                <div>
                  <strong>{step.name}</strong>
                  <code>{step.expression}</code>
                </div>
                <button
                  type="button"
                  className="icon-button subtle"
                  title="Remove computed column"
                  onClick={() =>
                    onRecipeChange(
                      removeTransform(
                        recipe,
                        (candidate) =>
                          candidate.kind === "computedColumn" &&
                          candidate.name === step.name,
                      ),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </aside>
  );
}
