# Workflow — Add RICA browser under `/enterprises`

**Goal.** Surface the RICA (Réseau d'Information Comptable Agricole) holdings dataset
under `/enterprises/rica`: a filtered list page on
`registered_rica_holdings` (filters: `year`, `ote_64`) plus a per-holding show
page that resolves the holding's `data` jsonb via
`registered_rica_variables` and `registered_rica_modalities`.

**Status when starting.** Branch `feature/lexicon-6.0.2`. No RICA references
exist anywhere in `src/`. The three tables are present in the configured
schema (verified against `lexicon__6_0_0-ekyviti` via `\d`).

---

## 1. Verified facts (do not re-derive)

### Tables

`registered_rica_holdings` (65 535 rows, schema `lexicon`):

| column | type | note |
|---|---|---|
| `id` | int, PK (serial) | surrogate, not stable across reloads — do not put it in URLs |
| `idnum` | int, NOT NULL | farm identifier, **unique only when paired with `year`** (`UNIQUE (idnum, year)`) |
| `year` | int, NOT NULL | indexed |
| `region_code`, `new_region_code` | varchar | |
| `ote_17`, `ote_64` | varchar | indexed; codes like `1510`, `1520`, … |
| `economic_dimension_class`, `legal_form` | varchar | |
| `altitude_zone`, `less_favoured_zone`, `environmental_zone` | varchar | |
| `closing_date` | date | |
| `sau_ha`, `total_area_ha`, `gross_product`, `gross_operating_surplus`, `operating_result` | numeric(14,2) | |
| `extrapolation_coefficient` | numeric(14,4) | |
| `data` | jsonb | hundreds of variable→value pairs per row (~45 KB pretty-printed for one holding) |

`registered_rica_variables` PK `(year, code)` — `label`, `data_type` (`num` / `char`), `length`.

`registered_rica_modalities` PK `(year, variable_code, modality_code)` — `label`.
The modality variable for `ote_64` is **`OTE64F`** (verified for 2024;
older years use `OTEXEF` family — see §6). Joining: holding's `ote_64`
value matches `modality_code` where `variable_code = 'OTE64F'` AND
`year = holding.year`.

Years present: 2019–2024 (at minimum).

### Routing convention (project-specific, not obvious from docs)

`API.path()` auto-registers `.json`/`.csv`/`.geojson` variants **unless the
last segment is a `:param`**. For show routes ending in `:param`, the
extension travels inside the param: `generateResourcePage` splits the param
on `.` (`src/page-generators/generateResourcePage.ts:20`) to recover both
the id and the output format. Example: `/enterprises/enterprises/:siren`
serves `/enterprises/enterprises/123456789.json` by splitting the captured
`:siren` value.

**Implication for RICA.** A holding needs `(idnum, year)` to be unique.
Use a single composite param so the existing convention works:
`/enterprises/rica/:holding` where `:holding = <year>-<idnum>` (e.g.
`/enterprises/rica/2023-12345.json`).

### Existing patterns to mirror

- `src/namespaces/Enterprises.ts` — single-file namespace with `AutoList`
  hub at `/enterprises`, table page at `/enterprises/enterprises`, and
  resource page at `/enterprises/enterprises/:siren`. The whole file is
  ~230 lines. Adding RICA inline would push it past comfort; recommendation
  in §4.
- `src/namespaces/GeographicalReferences/` — directory layout with one
  `<Resource>.ts` (table + types) and one `<Resource>API.ts` (routes) per
  resource, composed in `index.ts`.
- `Field.Select` with options map for dropdown filters (see CAP code filter
  on `Enterprises.ts:62`).

### Translations

`src/assets/translations.csv` is read once at module load
(`src/Translator.ts`); editing requires a **manual server restart**, even
with `--hot`. Missing keys return the key unchanged (no crash, but ugly).

### Credits

`generateTablePage` takes a `credits:` select against `CreditTable`. The
existing convention is `.where("datasource", "=", "<slug>")`. Need to check
whether `registered_credits` already has a row for RICA (§3, step 1).

---

## 2. Out-of-scope (explicit)

- No new database tables, no migrations.
- No write endpoints — RICA is read-only like every other resource.
- No bulk CSV/GeoJSON export of the full `data` jsonb (see §6 for trade-off).
- No `try/catch` introduced anywhere — fallible work returns `Result`
  (load-bearing project policy per CLAUDE.md).
- Do not run `bin/tag.ts` — releases are explicit.

---

## 3. Implementation phases

Each phase produces a runnable state. Run `bun start` between phases and
hit the new routes manually; there is no test suite.

### Phase A — Scaffolding & list page (the 80%)

Goal: list view at `/enterprises/rica` works, filters work, link added to
the `/enterprises` hub.

1. **Check credits row exists.**
   `SELECT * FROM "<schema>".registered_credits WHERE datasource ILIKE '%rica%';`
   If absent, decide with user whether to seed one or omit `credits:` from
   the generator call. Don't silently INSERT.

2. **Decide file layout.** Recommendation: keep RICA inside the same
   namespace file `src/namespaces/Enterprises.ts` *for the list page only*,
   matching the existing one-file pattern. If/when the show page (Phase B)
   pushes the file past ~400 lines, split to
   `src/namespaces/Enterprises/` directory with `Enterprises.ts` +
   `EnterprisesAPI.ts` + `Rica.ts` + `RicaAPI.ts` and `index.ts`
   composing both. **Confirm with user before splitting** — restructuring
   existing working code is a separate concern from adding RICA.

3. **Add the type and Table.** In `Enterprises.ts` (or `Rica.ts` if split):

   ```ts
   export interface RicaHolding {
     id: number
     idnum: number
     year: number
     region_code?: string
     new_region_code?: string
     ote_17?: string
     ote_64?: string
     economic_dimension_class?: string
     legal_form?: string
     altitude_zone?: string
     less_favoured_zone?: string
     environmental_zone?: string
     closing_date?: Date
     sau_ha?: string            // numeric → string from pg
     total_area_ha?: string
     gross_product?: string
     gross_operating_surplus?: string
     operating_result?: string
     extrapolation_coefficient?: string
     data?: Record<string, unknown>
   }

   export const RicaHoldingTable = Table<RicaHolding>({
     table: "registered_rica_holdings",
     primaryKey: "id",
   })
   ```

   And matching types/Tables for `RicaVariable` (PK `(year, code)` — see
   §5 caveat about composite PK) and `RicaModality`.

4. **Add the list route** `/enterprises/rica` using `generateTablePage`:
   - `query`: `RicaHoldingTable(cxt.db).select("idnum","year","ote_64","region_code","sau_ha","gross_product").orderBy("year","DESC").orderBy("idnum","ASC")`.
   - `form`:
     - `year`: `Field.Select` populated from a one-shot
       `SELECT DISTINCT year ORDER BY year DESC` (lazy: hard-code 2019..currentYear; better: small helper that caches the distinct list — see §5).
     - `ote_64`: `Field.Select` populated from a one-shot
       `SELECT DISTINCT modality_code, label FROM registered_rica_modalities WHERE variable_code = 'OTE64F' AND year = <latest-year> ORDER BY modality_code`. (Latest-year labels are fine for the filter; the OTE_64 catalog is stable across years even if its variable code name varies — see §6.)
   - `formHandler`: `query.where("year", "=", input.year)` and
     `query.where("ote_64", "=", input.ote_64)` when each is set.
   - `columns`: `idnum`, `year`, `ote_64` (label, not code — resolve in handler), `region_code`, `sau_ha`, `gross_product`, `details`.
   - `handler`: each row returns `Hypermedia.*` values; `idnum` and
     `details` link to `/enterprises/rica/<year>-<idnum>`. `ote_64` shows
     resolved label from a per-page lookup of modalities (see §5 — pre-fetch
     to avoid N queries).
   - `credits`: `CreditTable(...).select().where("datasource", "=", "rica")` *only if step 1 confirmed the row exists*.

5. **Add the link in the hub.** In the `AutoList` block at
   `Enterprises.ts:27-43`, add a second `Hypermedia.Link` pointing to
   `/enterprises/rica` with the new translated label.

6. **Translations.** Add to `src/assets/translations.csv`:
   - `enterprises_rica_title` — *RICA — Réseau d'Information Comptable Agricole / FADN — Farm Accountancy Data Network*
   - `enterprises_rica_year` / `enterprises_rica_ote_64` / `enterprises_rica_idnum` / `enterprises_rica_region` / `enterprises_rica_sau` / `enterprises_rica_gross_product` etc.
   - **Restart `bun start`** after editing the CSV.

7. **Manual check.**
   - `GET /enterprises` shows the new RICA link.
   - `GET /enterprises/rica` paginates 150/page, sorts year-desc.
   - Year filter narrows results; OTE filter narrows results; both
     combined work; `.json` and `.csv` variants render.
   - One row's `idnum` link routes to `/enterprises/rica/<year>-<idnum>`
     (will 404 until Phase B — fine).

**Phase A is shippable on its own.** Stop here and demo if helpful.

### Phase B — Show page

Goal: `/enterprises/rica/:holding` returns identification, areas,
financials, and a resolved view of the holding's `data` jsonb.

1. **Parse the composite param.** In the route handler, split
   `cxt.params.<x>` on `.` (extension), then on `-` (year-idnum). Reject
   shapes that don't match with `Err(new NotFound())`.

2. **Fetch the holding.**
   `RicaHoldingTable(cxt.db).select().where("year","=",year).where("idnum","=",idnum).run()` — exactly one row, else `NotFound`.

3. **Fetch the OTE_64 label** for `(year, holding.ote_64)` from
   `registered_rica_modalities` where `variable_code` matches the
   year-appropriate code (see §6).

4. **Resolve the `data` jsonb.** This is the heavy part. Approach:
   - One query: `SELECT code, label, data_type FROM registered_rica_variables WHERE year = $1` — returns the full variable catalog for that year (a few hundred rows, cacheable per-year).
   - One query: `SELECT variable_code, modality_code, label FROM registered_rica_modalities WHERE year = $1` — modality dictionary for that year.
   - For each key in `holding.data`:
     - Resolve label via the variable catalog (skip unknown keys).
     - If `data_type = 'char'` and a modality match exists for `(variable_code = key.toUpperCase(), modality_code = value)`, render the modality label.
     - Otherwise render the raw value (numbers as `Hypermedia.Number`, strings as `Hypermedia.Text`).
   - **Do not** issue one query per variable.

5. **Compose the page** via `generateResourcePage`:
   - `details`: the structured columns (idnum, year, ote_64 label, region,
     SAU, financials, etc.).
   - `sections`: empty (`{}`) for v1 — `generateResourcePage` does not
     accept arbitrary rendered content. **Trade-off:** the resolved `data`
     jsonb (hundreds of variables) doesn't fit `details` cleanly. Two options:
     - **B1 (recommended for v1):** show only the top-level financial/area
       columns in `details`; expose the full resolved variable list as a
       *separate route* `/enterprises/rica/:holding/variables` that uses
       `generateTablePage` over an in-memory array (the resolved
       `data` jsonb), with columns `code | label | value | resolved-label`.
       Link to it from the show page via the `links:` array on
       `generateResourcePage`.
     - **B2:** extend `ResourcePage` template / `generateResourcePage` to
       accept a `groups` field of `Record<string, Record<string, Hypermedia>>`
       so the variables can be grouped (identification / structure / production / accounting). Larger surface change; defer unless asked.

6. **CSV/GeoJSON for the show route.** The `:holding` param's extension
   handling already routes `.json` through `generateResourcePage`. `.csv`
   and `.geojson` are not generated by `generateResourcePage` (only `html`
   and `json` are wired in `generateResourcePage.ts:32-38`); that's the
   existing behavior for `/enterprises/enterprises/:siren` and is fine.

7. **Manual check.**
   - `GET /enterprises/rica/2023-12345` returns a page with identification,
     financials, and either the embedded resolved variables (B2) or a link
     to the variables sub-route (B1).
   - `.json` variant works.
   - Bad shapes (`/enterprises/rica/foo`, `/enterprises/rica/2099-1`) → 404.

### Phase C — Polish (only if asked)

- Sort/group resolved variables by RICA section convention if a grouping
  scheme is available in the data dictionary.
- Add `ote_17` filter alongside `ote_64`.
- Add `region_code` filter (Select populated from
  `registered_administrative_regions` if such a table exists, else from
  distinct `region_code` in the holdings table).
- Aggregate page: per-year, per-OTE summary counts (separate route).

---

## 4. File touch list

**Modify:**
- `src/namespaces/Enterprises.ts` — add RICA link to `/enterprises` hub;
  add `/enterprises/rica` and `/enterprises/rica/:holding` routes;
  add `RicaHolding`, `RicaVariable`, `RicaModality` types + Tables;
  add the data-resolution helper.
- `src/assets/translations.csv` — new `enterprises_rica_*` keys (fr + en, and any other columns currently in the CSV).

**Possibly modify (only if Phase A step 1 finds no credits row, and user opts to seed):**
- New SQL run separately (not committed) to `INSERT INTO registered_credits …` — confirm with user first.

**Do not create:**
- No new templates. Use `AutoList`, `generateTablePage`, `generateResourcePage`. If B2 is chosen, that *would* touch `ResourcePage.tsx` — defer.

**Possibly restructure (Phase A step 2, only if file grows uncomfortably):**
- `src/namespaces/Enterprises/` directory split. Confirm with user before doing it; restructuring is independent of the RICA feature.

---

## 5. Risks & decisions to surface

1. **Composite primary key on `registered_rica_variables` and `_modalities`.**
   The `Table<T>` builder in `src/Database.ts` takes a single `primaryKey`
   string. The two reference tables have composite PKs (`(year, code)` and
   `(year, variable_code, modality_code)`). Reading via raw `db.query` like
   `fetchSubsidiesBySiren` in `Enterprise.ts:46-79` is the established
   workaround when `Table` doesn't fit. **Decision needed:** use `Table`
   with `primaryKey: "code"` (cosmetic lie — we never call `.read()` on it,
   only `.select()`) or write raw SQL helpers `fetchRicaVariables(year)` and
   `fetchRicaModalities(year)` returning `AsyncResult`. Recommendation:
   raw SQL helpers — clearer intent, mirrors existing precedent, sidesteps
   any future `Table` assumption about PK uniqueness.

2. **Distinct-year query for the filter dropdown.** Running it on every
   request to `/enterprises/rica` adds a roundtrip. Three options:
   (a) hardcode 2019..currentYear (simple, drifts when DB advances);
   (b) cache in module scope on first request (fine — the year set is
   essentially immutable mid-deploy);
   (c) fetch every request (negligible cost, but it's still a query). Pick
   (b). Same pattern for the OTE_64 modality list.

3. **`data` jsonb rendering cost.** Each holding has hundreds of jsonb
   keys. Rendering them all in the show page is the entire payload weight.
   The B1/B2 trade-off in Phase B step 5 is the choice; defer to user.

4. **Composite-param routing.** `/enterprises/rica/:holding` with
   `:holding = <year>-<idnum>` keeps the existing `.json` extension
   convention working but is slightly opaque. Alternative
   `/enterprises/rica/:year/:idnum` would auto-register `.json`/`.csv`
   variants on the `:year` segment (because `:idnum` is the last
   `:param`), but then the show page handler needs to parse the extension
   off `:idnum` manually anyway — no real win. Stick with composite.

5. **Stale `THINGS-TO-KNOW.md`.** CLAUDE.md warns the doc is stale about
   the HTTP framework. Don't rely on it for new patterns.

---

## 6. Cross-year subtleties to verify during Phase A

- **Variable code for OTE_64 modalities.** Confirmed `OTE64F` in 2024.
  Older years (2019) have `OTEXE` in the *variables* table but no
  modality rows surfaced for variable_code `OTE_64`. Before wiring the
  filter dropdown, run:
  ```sql
  SELECT year, COUNT(DISTINCT modality_code)
  FROM "<schema>".registered_rica_modalities
  WHERE variable_code IN ('OTE64F', 'OTEXEF', 'OTE_64')
  GROUP BY year ORDER BY year;
  ```
  If pre-2020 years have no OTE64F modalities, the filter dropdown's
  labels will be missing for those years — fall back to displaying the
  raw `ote_64` code with no label for those rows. Document the gap, do
  not paper over it.

- **`data` jsonb key casing.** Sample keys (`aatac`, `achac`, `achag`,
  `acham`, `achan`) are lowercase, while `registered_rica_variables.code`
  values are uppercase (`IDNUM`, `MILEX`, `PBUCE`, `CDEXE`, `OTEXE`).
  The resolver in Phase B step 4 must `.toUpperCase()` the jsonb key
  when joining. Verify with:
  ```sql
  SELECT k FROM "<schema>".registered_rica_holdings,
         LATERAL jsonb_object_keys(data) k WHERE year = 2024 LIMIT 5;
  SELECT code FROM "<schema>".registered_rica_variables WHERE year = 2024 LIMIT 5;
  ```
  Same year, both samples, confirm the case mismatch before writing the
  join. If they actually match case at certain years, drop the
  `.toUpperCase()`.

---

## 7. Checkpoint summary

| Checkpoint | Verifies |
|---|---|
| Phase A step 1 | Credits row presence (avoids broken `credits:` call) |
| Phase A step 7 | List page renders, filters work, hub link in place, .json/.csv work |
| Phase B step 7 | Show page renders, data jsonb resolved against variable/modality dictionaries, .json works, 404 on bad shapes |
| §6 spot-checks | Cross-year OTE_64 modality coverage; jsonb-key vs variable-code casing |

---

**Next step.** Run `/sc:implement claudedocs/workflow_rica_enterprises.md` —
or execute Phase A inline if the user prefers a step-by-step session.
Phase A is shippable independently of Phase B.
