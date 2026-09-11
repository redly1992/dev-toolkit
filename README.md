# Europort Dev Toolkit

Interactive CLI to speed up local development.

## Getting Started

```bash
cd dev-toolkit
npm install
npm start
```

On first launch the toolkit detects the workspace hasn't been configured yet and walks you through **Setup** automatically.

## Features

### Setup *(run once per workspace)*

Patches the Angular workspace so Focus Serve works:
- Adds `build:focus` + `serve:focus` to `angular.json`
- Adds generated files to `.gitignore`

Auto-runs on first `npm start`. Can be re-run from the main menu anytime.

### Focus Serve

Start `ng serve` with only the modules you need compiled.
Cuts initial build time significantly — unused module trees are never parsed by esbuild.

**Usage:**
1. Run `npm run toolkit`
2. Select **Focus Serve**
3. Check/uncheck modules with `Space`, confirm with `Enter`
4. Choose **Start ng serve** — the dev server starts immediately

Your module selection is saved in `dev-toolkit/toolkit.config.json` and restored next time.

### Focus Test

Run `ng test` scoped to one spec file or a folder of specs.

**Interactive:** `npm start` → select **Focus Test**.

**Direct CLI (skips all prompts):**
```bash
node src/index.mjs focus-test src/app/modules/foo/bar.component.spec.ts
node src/index.mjs ft src/app/modules/foo               # folder of specs
node src/index.mjs ft src/app/modules/foo/bar.spec.ts --chrome  # visible browser
node src/index.mjs ft src/app/modules/foo/bar.component.spec.ts --no-watch  # single run, no re-run on change
```
Watch mode defaults to **on** and is persisted in `toolkit.config.json` (also toggleable from the interactive menu). Pass `--watch`/`--no-watch` to override for a single run.

Or via npm: `npm test -- src/app/modules/foo/bar.component.spec.ts`.

## Adding a New Feature

1. Create `src/features/my-feature.mjs` exporting a default object:
   ```js
   export default {
     name: 'My Feature',
     description: 'Short description shown in menu',
     async run() { /* your logic */ },
   };
   ```
2. Import it in `src/index.mjs` and add it to the `FEATURES` array.

## Files

| File | Purpose |
|---|---|
| `toolkit.config.json` | Saved module selections (committed) |
| `src/index.mjs` | Main menu loop + feature registry |
| `src/features/` | One file per feature |
| `src/utils/config.mjs` | Read/write `toolkit.config.json` |
| `src/utils/runner.mjs` | Run commands in workspace root |
