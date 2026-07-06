# Parquet Parley

[![Build](https://github.com/Stay-Umble/umble.tools.parquet.parley/actions/workflows/build.yml/badge.svg)](https://github.com/Stay-Umble/umble.tools.parquet.parley/actions/workflows/build.yml)

Parquet Parley is a cross-platform desktop viewer and non-destructive transform workspace for local Parquet files.

## What V1 Includes

- Tauri 2 desktop shell for Windows, macOS, and Linux.
- React + TypeScript frontend with AG Grid Community.
- Rust backend using DuckDB to query Parquet files directly.
- Local file and folder datasets.
- Page-based data loading for large datasets.
- Custom searchable facet filters with exact lazy counts.
- Basic non-destructive transform recipes: filters, sorts, hidden columns, display labels, casts, and computed columns.
- Portable `.parley` project files.
- CSV and Parquet export of the current filtered/transformed view.

## Development

```powershell
npm.cmd install
npm.cmd run tauri dev
```

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
Push-Location src-tauri
cargo test
Pop-Location
```

## GitHub Builds

GitHub Actions runs only when a version tag is pushed. Each successful run publishes a GitHub Release with a Windows `.msi` installer, Linux `.deb` and `.AppImage` bundles, and macOS `.dmg` bundles attached.

```powershell
git tag v0.1.0
git push origin v0.1.0
```
