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

### Catalogue, records and MCP

- `src/catalog/Catalog.ts` reads `lexicon_meta.packages` (the manifests of the packages in service) and `lexicon_meta.repository_versions` (what the loader saw in the repository); `src/namespaces/Catalog.tsx` serves `/catalog` and `/catalog/:name`. Download addresses come from `PACKAGES_URL` and are not given for reserved packages.
- `src/links/Links.ts` shapes the pre-joined rows of `link_communes` and `link_enterprises`; `src/namespaces/Links.tsx` serves `/links/communes/:insee` (open) and `/links/enterprises/:siren` (members). The format is part of the last segment (`17387.json`), since `.path()` registers no variant after a `:param`.
- `src/mcp/Mcp.ts` is a stateless MCP server: `handleMcpMessage(message, backend)` answers one JSON-RPC message and knows nothing of HTTP or the database. `src/namespaces/Mcp.ts` gives it its backend at `POST /mcp`. `read_resource` asks the API itself over loopback with the caller's key and address, so that a tool never sees more than the caller would; `jsonPathOf()` refuses `/admin`, `/bundles`, `/mcp` and anything that is not a plain path. A tool that fails answers `isError: true`, not a JSON-RPC error.
- Tables are served as JSON under a `text/plain` content type: do not rely on the header to recognise JSON.

### R&D documents and Duke, the assistant

- `src/rd-agri/RdAgri.ts` searches `registered_rd_agri_documents` through its `search` tsvector column. Accents are removed on both sides with the same `translate()` mapping as `lib/datasources/rd_agri.rb` in the lexicon repository: keep the two in step. `src/namespaces/RdAgri.tsx` serves `/rd-agri/documents`; the MCP tools `search_rd_documents` and `get_rd_document` use the same module.
- `src/assistant/` is Duke: `Conversation.ts` is the loop between the model and the MCP tools and knows nothing of HTTP, of the provider or of the database (its dependencies are injected, see `Assistant.test.ts`); `Provider.ts` speaks "chat completions" to any provider; `ProviderQueue.ts` lets one call through at a time; `McpClient.ts` only knows the messages of the protocol; `Allowance.ts` counts questions per caller in memory; `AssistantStore.ts` keeps daily counts and two settings in `lexicon_access`.
- `src/namespaces/Tools/AssistantController.tsx` is the page and `POST /tools/assistant/ask`, which answers a stream of events. Duke always reads Lexicon **as an anonymous caller**, whoever asks: nothing reserved must reach the provider. The text of a question is never stored nor logged. The sources shown under an answer come from the tool results, never from the text of the model.
- Mistral refuses a `user` message after a `tool` message: to make the model answer, `tool_choice: "none"` is used instead.

### History of the CAP parcels

`src/cap-history/CapHistory.ts` answers "what was declared at this point, campaign after campaign": it reads `registered_graphic_parcels` (latest campaign) and `registered_graphic_parcels_history` (earlier ones) by place, since parcel ids change every campaign, and takes the label of a crop code for the year of the campaign. Served at `/geographical-references/cap-parcels/history`, shown by the parcel identifier, and given to agents as the MCP tool `get_crop_history`. Where the history table is absent, the latest campaign alone is answered.

### CAP subsidies, year by year

`registered_cap_beneficiaries` and `registered_cap_subsidies` hold several years. Amounts of different years are never added up: `src/cap-subsidies/CapSubsidies.ts` (`subsidiesByYear`) groups them, the enterprise page and the parcel identifier show the latest year, and the enterprise record (`/links/enterprises/:siren`, MCP `get_enterprise`) gives `cap-by-year`.

### Interface

- **Style**: `public/style.css` is the whole stylesheet: tokens at the top (`--ink`, `--lexicon`, the three family colours of the logo), then components. Ubuntu is served from `public/fonts/`. Components carry classes, not inline styles. Static files are addressed through `asset()` (`src/templates/Assets.ts`), whose stamp changes at each start: browsers cache `/public/*` for a day.
- **Layout**: `src/templates/layouts/Layout.tsx` draws the header, the menu and the footer. The current menu entry is told by the breadcrumbs (`sectionOf`), and "Explore" is inserted in the breadcrumbs of the pages of data (`shownBreadcrumbs`): namespaces do not know about it. A top-level page whose breadcrumbs only hold the home page passes `section` itself. The administration has its own layout, same stylesheet, `body.admin`.
- **Language**: `languageOf` in `applyRequestConfiguration.ts`. The cookie `lang` (set by `/language/:code`) comes first; without it a page is in French, while JSON and CSV still follow `Accept-Language`. The translator carries its language (`t.language`).
- **Home page**: `src/home/Weave.ts` holds, by hand, the datasets and the keys linking them; `Weave.test.ts` keeps it consistent, but only a look at the schema tells whether a knot is true. Figures come from the catalogue. `src/templates/components/Weave.tsx` renders it as a real table (readable without styles nor scripts), `public/weave.js` adds the hovering. `/explore` holds what the home page used to list.
- `/public/*` only serves files of the `public` folder (`publicFileOf` in `API.ts`).

### Templates

`src/templates/` contains JSX components (pages, views, layouts, components). These render **server-side to HTML strings** — no React, no client state, no hooks. JSX factory is `Html.createElement` from `@elysiajs/html`. SVG icons live in `public/icons/` and are referenced as `/public/icons/<name>.svg`; the `/public/*` route in `API.ts` serves them with a 1-day cache.

### Translations

`src/assets/translations.csv` is the i18n source (columns: `key,fr,en,...`). Use `context.t("some_key")` — missing keys return the key string unchanged. New strings go in the CSV; the server must be restarted to pick them up.

## Conventions worth knowing

- **No semicolons, no `var`, prefer `const`.** Avoid `switch`/`break`/`continue` — use `match()` from `shulk` instead. `documentation/CODING-GUIDELINES.md` is enforced informally but consistently.
- **Endpoint paths and JSON keys are `kebab-case`.** Types are `PascalCase`, variables/functions `camelCase`, constructors (`Table`, `Hypermedia.Text`, ...) `PascalCase`.
- **API versioning is avoided on principle** ("user land is sacred", per the coding guidelines). Don't break public endpoint shapes or response keys without an explicit conversation about it.
- **Releases are tagged from `main` via `bun run ./bin/tag.ts`** — that script pushes to `origin/main` and creates a `v<version>` tag. Do not run it without being asked.
