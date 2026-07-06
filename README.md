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

GitHub Actions runs on pushes and pull requests to `main`, plus manual runs from the Actions tab. Each successful build uploads Windows, Linux, and macOS app bundles as workflow artifacts.

To publish a GitHub Release with installers attached, push a version tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

You can also run the workflow manually and enter a release tag such as `v0.1.0`.
