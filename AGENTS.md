# Repository guide

Three independent browser extensions published from this repo (Edge/Chrome/Firefox). There is no root manifest, committed lockfile, CI, test suite, linter, or formatter. `README.md` is the user-facing feature list and store-link table, not developer documentation.

- `二维码/` — QR code generate/decode. WXT 0.21 + Vue 3, Chrome/Edge MV3 and Firefox MV3.
- `右键搜图/` — image-search context menu + options page. WXT 0.20 + Vue 3 + Tailwind 4, Chrome/Edge MV3. Firefox scripts exist, but its README still lists Firefox support as TODO.
- `复制链接文字/` — plain MV3 JS (`manifest.json`, `background.js`, `content.js`, vendored Toastify in `libs/`). No build step; load the directory unpacked and edit files directly.

## Commands

Run them inside an extension directory; each WXT extension is its own pnpm project.

```bash
cd 二维码          # or 右键搜图
pnpm install       # required once; runs `wxt prepare`
pnpm dev           # Chromium, profile from wxt.config.ts
pnpm dev:firefox
pnpm build         # .output/chrome-mv3/
pnpm build:firefox
pnpm zip           # store zips in .output/
pnpm compile       # typecheck only (vue-tsc --noEmit)
```

Verify manually: `pnpm compile`, `pnpm build`, then load `.output/<target>/` unpacked and exercise the context menu. There is no `test`/`lint` script.

- `二维码` currently fails `pnpm compile` with pre-existing strict-null errors in `src/services/qrScanner.ts` and `src/components/PasteImageDialog.vue`; check whether an error is new rather than assuming your change caused it.
- Install only with pnpm in `二维码`: `pnpm-workspace.yaml` applies `patches/web-ext.patch`. Do not delete `patches/` or switch to npm/yarn.

## WXT conventions

- Entrypoints live in `src/entrypoints/` (`background.ts`, `content/`, `popup/`, `options/`); file/directory names define manifest entries.
- `defineBackground`, `defineContentScript`, `browser`, and `createIntegratedUi` are auto-imported. Types come from generated `.wxt/` (gitignored, recreated by `pnpm install`/`wxt prepare`); never edit `.wxt/` or its gitignore entries.
- `tsconfig.json` only extends `.wxt/tsconfig.json`, so a fresh clone is not typecheckable until install runs.
- WXT defaults Firefox to MV2. The build/zip scripts explicitly pass `--mv3`; `右键搜图`'s `dev:firefox` omits it and therefore runs MV2. Use `pnpm wxt -b firefox --mv3` when testing the actual Firefox target.
- Dev profiles and `keepProfileChanges` are in each `wxt.config.ts` (under `.wxt/`). To debug in Edge instead of bundled Chromium, set `CHROME_PATH` in that extension's tracked `.env` (currently a commented template).

## 二维码 specifics

- Context-menu flow: selection/link text is written to `storage.session` (fallback `local`) under `qrCodeText`, then `action.openPopup()`. The popup reads and removes the key, and also accepts a `#text=` hash fallback. Preserve the consume-and-clear behavior when editing this path.
- Image/paste/screenshot actions are forwarded by background to the content script. Cross-origin images are fetched by background (`fetchImage`) because the content script cannot.
- Every UI string must be added to both `public/_locales/en/messages.json` and `zh_CN/messages.json` and kept in sync (manifest name/description use `__MSG_*` with `default_locale: en`). Keep the Firefox-specific `page_action` (address-bar button, used by `openPopup()`) and `browser_specific_settings.gecko` entries.
- `.env.submit` is gitignored but exists locally with live Chrome/Edge/Firefox publishing credentials. Never print, commit, or overwrite it. Publishing uses `pnpm wxt submit --dry-run` / `pnpm wxt submit`; see `二维码/README.md`.

## 右键搜图 specifics

- Context-menu item IDs are engine **names**, and menus are rebuilt whenever `storage.local.SearchEngines` changes. `DefaultEngines` is the reset source.
- `src/entrypoints/options/` is a vanilla TS page using SortableJS directly; it is not a Vue entrypoint. `vuedraggable` is declared in `package.json` but unused.
- Tailwind 4 is wired via `@tailwindcss/vite`; page styles are split under `src/entrypoints/options/styles/`.

## Conventions

- Comments, UI text, READMEs, and commit messages are Chinese; keep new user-facing text Chinese (localized in `二维码`).
- Versions are per extension and are the store versions: `package.json` for the WXT extensions, `manifest.json` for `复制链接文字`. Bump before zip/submit.
