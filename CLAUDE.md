# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hypermedia/REST API in front of the Lexicon agronomic reference database. Same resource is served as HTML, JSON, CSV, or GeoJSON by appending an extension to the path (e.g. `/viticulture/vine-varieties.csv`). The HTML responses are full pages — this is the public site at https://lexicon.osfarm.org as well as the API.

Runtime is **Bun + TypeScript**, HTTP is `Bun.serve` directly (not Elysia, despite what `documentation/THINGS-TO-KNOW.md` says — that section is stale). HTML is JSX rendered to string by `@elysiajs/html` (`Html.createElement` JSX factory, see `tsconfig.json`). DB is Postgres via `pg`.

## Commands

```sh
bun install            # install
bun start              # dev server with --hot reload, reads .env
bun run ./bin/tag.ts   # interactive release: bumps package.json, commits, tags, pushes (touches main + origin)
```

Unit tests run with `bun test` (files named `*.test.ts` next to the code). There is **no linter, no typecheck script, no build step**. Formatting is Prettier via `.prettierrc` (no semicolons, 2-space, printWidth 90, trailing commas).

`.env` is required to start — copy `.env.example` and fill `DB_HOST/PORT/USER/PASSWORD/NAME/SCHEMA`. The `DB_SCHEMA` (e.g. `lexicon__6_0_0-ekyviti`) is interpolated raw into queries via `import.meta.env.DB_SCHEMA` in `src/Database.ts`.

Editing `src/assets/translations.csv` requires a manual server restart — `--hot` does not pick it up because the CSV is read once at module load in `src/Translator.ts`.

## Architecture

### Request lifecycle

`src/index.ts` builds one `API` instance, mounts namespaces with `.use(...)`, and calls `.listen(PORT)`. `src/API.ts` is the whole router — namespaces are just other `API` instances whose endpoints get merged in. **`.path()` auto-registers `.json`/`.csv`/`.geojson` variants of every route** (unless the last segment is a `:param`), so do not register them manually.

Each request flows: `Bun.serve` route → `applyRequestConfiguration(path, req)` builds a `Context` (language from `accept-language`, output format from URL extension, Postgres pool, translator, formatters) → handler returns a string (HTML), `Response`, or value → wrapped in `Response` with `text/html` if not already a `Response`.

The `Pool` is a **module-level singleton** in `applyRequestConfiguration.ts` — every request shares it.

### Namespaces

Each namespace under `src/namespaces/` exports an `API.new()...` chain. Larger ones (`GeographicalReferences/`, `Tools/`) are directories with an `index.ts` that composes sub-APIs (one file per resource, typically `<Resource>.ts` for the table/types and `<Resource>API.ts` for the routes). Single-file namespaces (`Phytosanitary.ts`, `Viticulture.ts`, etc.) follow the same pattern inline. The convention for adding a new namespace is documented in `documentation/HOW-TO.md` — follow it.

### The four core abstractions

1. **`Table<T>(definition)(db)`** in `src/Database.ts` — a query builder factory. Returns `{ select, read, example }`. `select()` returns a chainable `Select` (`.where`, `.distinct`, `.groupBy`, `.orderBy`, `.limit`, `.offset`, `.run`, `.count`). **The schema name is hardcoded from `DB_SCHEMA` env var** — table strings in definitions are bare names like `"registered_graphic_parcels"`. `oneToOne` relations flatten both tables' fields into one object (see `documentation/THINGS-TO-KNOW.md`).

2. **`Hypermedia` tagged union** in `src/Hypermedia.ts` — every value rendered to the client is one of `Text | Number | Boolean | Datum | Date | Image | Link | List | Map | Undefined`. Built with `Hypermedia.Text({...})` etc., dispatched with `match()` from `shulk`. Same union serializes to HTML, JSON, and CSV via separate converters in the same file.

3. **`generateTablePage(context, params)`** in `src/page-generators/` — the workhorse. Given a `Select` query, column labels, a per-row `handler` mapping each row to `Hypermedia` values, and optional `form`/`formHandler`/`credits`, it handles pagination (150/page), filtering, output-format dispatch, and credits rendering. Most endpoints are a single call to this. `generateResourcePage` is the single-record equivalent; `generateMapSection` and `generateDocumentation` are specialized.

4. **`Result<E, T>` monad from `shulk`** — the project's deliberate alternative to `try/catch`. Fallible functions return `Result`, callers use `.map`/`.mapErr`/`.flatMap`. **Do not introduce `try/catch`**; the rationale is in `documentation/THINGS-TO-KNOW.md` and it is load-bearing project policy.

### Access control

`src/access/` decides who is served, before any handler runs (`API.listen`). A caller without key is anonymous and limited per IP address; a key (`Authorization: Bearer lex_…` or `X-API-Key`) gets the limits and scopes of its plan. Refusals are `401` (bad key, or a reserved resource without key), `403` (scope not in the plan), `429` (allowance exhausted, with `Retry-After`) and `503` (keys unreadable). Every response carries `RateLimit-*` headers.

- State lives in the Postgres schema `lexicon_access` (`DB_ACCESS_SCHEMA`), created at start by `Schema.ts`; keys and plans are cached in memory and re-read every 30 seconds, usage is flushed every minute. No IP address is ever stored.
- A namespace reserves its paths with `API.new().restrictedTo("members")`; a handler can also test `cxt.identity.scopes` (the parcel identifier hides owners from anonymous callers this way).
- `bun run bin/key.ts create|list|revoke` manages keys; a key is printed once and only its hash is stored.
- The pure parts (`RateLimit.ts`, `AccessControl.ts`, `ApiKey.ts`, `CallerAddress.ts`) take the time as a parameter and are covered by `bun test`.
- `TRUSTED_PROXIES` (default 1) says how many reverse proxies sit in front: the caller address is read from the `X-Forwarded-For` entry they appended, never from what the caller sent.

### Administration

`src/namespaces/Admin/` serves `/admin`: login, summary, keys (create, extend, change plan, renew, revoke), plans, usage (with CSV export), datasources in service (read from `lexicon_meta`) and the audit log. Pages are French only and rendered by `AdminLayout`, which loads no third-party script.

- These paths have the scope `admin`: the router skips keys and rate limits for them, and every handler is wrapped by `administered()` (`session.ts`), which requires a session and checks the CSRF token of each `POST`.
- Sessions are a random token in an `HttpOnly`, `SameSite=Strict` cookie limited to `/admin`; only its hash is stored. Login is limited to five attempts per quarter of an hour and per address.
- Administrators are created with `bun run bin/admin.ts create <email>` (password asked, or read from standard input); there is no sign-up.
- JSX children are **not escaped** by `@elysiajs/html`: anything that is not a literal goes through `e()` from `AdminLayout.tsx`.
- Every action is written to `lexicon_access.audit_log`.

### Private bundles

`src/namespaces/Bundles.ts` serves `/bundles/<flavor>/<path>` from the directory `BUNDLES_ROOT`, only to a key carrying the scope `bundle:<flavor>` (or `bundle:*`, see `access/Scope.ts`). The route itself is open so that the handler can answer `401`/`403` per flavor; `fileOfBundle()` refuses any path leaving the bundle. A bundle is a Lexicon repository of packages, downloaded by `./lexicon fetch` on the other side.

### Templates

`src/templates/` contains JSX components (pages, views, layouts, components). These render **server-side to HTML strings** — no React, no client state, no hooks. JSX factory is `Html.createElement` from `@elysiajs/html`. SVG icons live in `public/icons/` and are referenced as `/public/icons/<name>.svg`; the `/public/*` route in `API.ts` serves them with a 1-day cache.

### Translations

`src/assets/translations.csv` is the i18n source (columns: `key,fr,en,...`). Use `context.t("some_key")` — missing keys return the key string unchanged. New strings go in the CSV; the server must be restarted to pick them up.

## Conventions worth knowing

- **No semicolons, no `var`, prefer `const`.** Avoid `switch`/`break`/`continue` — use `match()` from `shulk` instead. `documentation/CODING-GUIDELINES.md` is enforced informally but consistently.
- **Endpoint paths and JSON keys are `kebab-case`.** Types are `PascalCase`, variables/functions `camelCase`, constructors (`Table`, `Hypermedia.Text`, ...) `PascalCase`.
- **API versioning is avoided on principle** ("user land is sacred", per the coding guidelines). Don't break public endpoint shapes or response keys without an explicit conversation about it.
- **Releases are tagged from `main` via `bun run ./bin/tag.ts`** — that script pushes to `origin/main` and creates a `v<version>` tag. Do not run it without being asked.
