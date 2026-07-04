export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

export function compactPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.length <= 3) {
    return path;
  }
  return `${parts.at(-3)}/${parts.at(-2)}/${parts.at(-1)}`;
}

export function extensionForFormat(format: "csv" | "parquet"): string {
  return format === "csv" ? "csv" : "parquet";
}

