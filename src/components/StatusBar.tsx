import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { formatCount } from "../lib/format";

interface StatusBarProps {
  busy: boolean;
  error: string | null;
  totalRows: number;
  offset: number;
  pageSize: number;
  schemaMismatch: boolean;
}

export function StatusBar({
  busy,
  error,
  totalRows,
  offset,
  pageSize,
  schemaMismatch,
}: StatusBarProps) {
  const start = totalRows === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, totalRows);

  return (
    <footer className="status-bar">
      <div className={error ? "status-pill error" : "status-pill"}>
        {busy ? (
          <Loader2 size={16} className="spin" />
        ) : error ? (
          <AlertTriangle size={16} />
        ) : (
          <CheckCircle2 size={16} />
        )}
        <span>{error ?? (busy ? "Working" : "Ready")}</span>
      </div>
      {schemaMismatch ? (
        <div className="status-pill warning">
          <AlertTriangle size={16} />
          <span>Project schema changed</span>
        </div>
      ) : null}
      <div className="status-range">
        {formatCount(start)}-{formatCount(end)} of {formatCount(totalRows)}
      </div>
    </footer>
  );
}
