import { X } from "lucide-react";
import type { RowRecord } from "../types";

interface CellInspectorProps {
  column: string;
  value: string | null;
  row: RowRecord;
  onClose: () => void;
}

export function CellInspector({
  column,
  value,
  row,
  onClose,
}: CellInspectorProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="cell-inspector"
        role="dialog"
        aria-modal="true"
        aria-label="Cell inspector"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>{column}</h2>
            <p>{value === null ? "(null)" : "Cell value"}</p>
          </div>
          <button type="button" className="icon-button subtle" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <pre>{value === null ? "(null)" : value}</pre>
        <div className="row-snapshot">
          {Object.entries(row).map(([key, item]) => (
            <div key={key}>
              <strong>{key}</strong>
              <span>{item ?? "(null)"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

