# Europort Dev Toolkit

Interactive CLI to speed up local development.

## Getting Started

No manual setup required. Just run from the `dev-toolkit/` folder:

```bash
cd dev-toolkit
npm start
```

`npm start` automatically installs dependencies on first run via `prestart`.

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
