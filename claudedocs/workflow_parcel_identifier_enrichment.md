# Workflow — Enrichissement du Parcel Identifier

**Cible :** `src/namespaces/Tools/ParcelIdentifierController.ts` + `src/templates/pages/ParcelIdentifier.tsx`
**Endpoint :** `GET /tools/parcel-identifier?latitude=<lat>&longitude=<lon>` (et `.json` / `.geojson` auto-générés par `API.path`)
**Persona :** agriculteur — veut le maximum d'information sur la parcelle à partir d'un point (météo, propriétaire, culture, rendement, contraintes réglementaires, sol, eau).
**Point de test :** `latitude=45.8275731903227&longitude=-0.783718835725218` (ST PORCHAIRE, Charente-Maritime, dept 17).

> Ce document est un **plan d'implémentation**, pas une exécution. Aucun code n'est modifié ici.

---

## 1. État actuel

`ParcelIdentifierController` interroge déjà :

| Section | Table(s) | Clé spatiale | Renvoie qqch au point test ? |
| --- | --- | --- | --- |
| `information` (commune) | `registered_postal_codes` | `ST_CONTAINS(city_shape)` | ✅ ST PORCHAIRE / 17250 |
| `cadastre` (parcelle) | `registered_cadastral_parcels` | `ST_CONTAINS(shape)` | ❌ (pas de couverture cadastrale ici) |
| `cap` (parcelle PAC) | `registered_graphic_parcels` + `master_crop_production_cap_codes` | `ST_CONTAINS(shape)` | ❌ au point exact ; ✅ à ~2 km (Saint-Porchaire, `cap_crop_code` ∈ {SNE, PPR, PTR, JAC, …}) |
| `transactions` (DVF) | `registered_cadastral_prices` | via `cadastral_parcel_id` | ❌ (dépend du cadastre) |
| `last-year-weather-reports` | `registered_weather_stations` + `registered_hourly_weathers` | `orderByCloseness(centroid)` | ⚠️ station SAINTES (FR17415003) à ~30 km, **8 704 reports sur 12 mois**, dernier le 2026-05-12 — donc affichable, mais bloqué par le bug § 1 |

**Bugs latents à corriger pendant l'enrichissement :**

1. **B1 — Météo + transactions bloquées par absence de cadastre.** `retrieveParcelData` fait un `flatMap` qui renvoie `Err` si **soit** la parcelle cadastrale **soit** la station est absente. Conséquence : sur le point test (pas de parcelle cadastrale, station valide), `lastYearWeatherReports` finit à `undefined` alors que la station SAINTES a 8 704 rapports sur la dernière année. Voir tâche P2.4.
2. **B2 — Jointure CAP non déterministe sur l'année.** La PK réelle de `master_crop_production_cap_codes` est composite `(cap_code, production, year)`, avec **9 années disponibles (2017→2025)** et 208 codes pour 2025. La déclaration `oneToOne` actuelle dans `CapParcelTable` joint **uniquement sur `cap_code`** → renvoie une ligne arbitraire (et démultiplie potentiellement les résultats parcelle×année×production côté SQL). Le libellé de culture exposé sur `/tools/parcel-identifier` est donc instable. Voir tâche P2.6.

---

## 2. Nouveaux datasets retenus

Tous validés par requête `ST_CONTAINS` / `ST_DWithin` sur le point test (sauf indication).

### A. Propriétaire(s) de la parcelle cadastrale — **prioritaire**
- `registered_cadastral_parcel_owners` (1..N par parcelle, lien `cadastral_parcel_id`)
- `registered_cadastral_owners` (jointure `majic_number`, fournit `denomination`, `siren`, `legal_form_short`, `person_group_label`)
- Champs clés : `denomination`, `siren`, `legal_form_short`, `parcel_surface_area`, `suf_surface_area`, `culture_nature_code` (nature de culture déclarée au cadastre, ex. terre, vigne…), `address`, `droit_code` (propriétaire, usufruitier, etc.).
- ⚠️ Donnée sensible (RGPD si personne physique). Voir § 7 — risques.

### B. Bâtiments cadastraux à proximité
- `registered_cadastral_buildings` — `shape`, `nature` ("Indifférencié", "Industriel", …).
- Recherche : `ST_DWithin(shape, point, 0.001)` (~100 m en EPSG:4326) ou intersection avec la parcelle si elle existe.
- 5 résultats au point test.

### C. Zones naturelles & contraintes environnementales — **prioritaire**
- `registered_natural_zones` — Natura 2000 (ZPS / SIC), ZNIEFF, etc., champ `nature`. **2 zones au point test.**
- `registered_protected_water_zones` — captages, périmètres de protection (vide au point test, mais à inclure).
- `registered_area_items` — autres zonages administratifs/protégés (vide au point test).

### D. Hydrographie à proximité
- `registered_hydrographic_items` — cours d'eau / réservoirs, géom `point` + `shape` + `lines` + `centroid`. Nom en JSONB (`{"fra": "..."}`).
- Recherche : `ST_DWithin(centroid, point, 0.05)` (~5 km), trié par `ST_DistanceSphere` ASC, top 5.
- "le Bruant" à 49 m au point test → pertinent pour les ZNT phyto.

### E. Sol
- `registered_soil_depths` — profondeur de sol par polygone (1 résultat : 30 cm).
- `registered_soil_available_water_capacities` — RU (réserve utile), min/max/référence + libellé (`< 50 mm` au point test).

### F. Rendements historiques par département
- `master_production_yields` — clé `(department_zone, specie/production, campaign)`.
- Le département se déduit du code INSEE de la commune (`registered_postal_codes.code`, ex. `17387` → dept `17`).
- Au point test (dept 17) : 10+ couples espèce/rendement pour la campagne 2020.

### G. Prix de production locaux + prix de marché européens
- `master_production_prices` — clé `department_zone`. Vide pour dept 17 mais brancher quand même.
- `registered_eu_market_prices` — non géo-localisé (niveau pays), filtrer sur `country = 'FR'`, retourner les N derniers prix par produit. Complément informatif.

### H. (Optionnel V2) Signes de qualité et d'origine
- `registered_quality_and_origin_signs` — pas de géométrie, seulement `geographic_area` en texte libre. Matching textuel imparfait sur le nom de commune. **À reporter en V2** sauf si on accepte un match approximatif.

### Datasets écartés
- `master_phenological_stages` — keyé par variété, sans dimension géographique. Non pertinent ici sans culture sélectionnée.
- `registered_rica_*` — données comptables, niveau exploitation. Hors scope d'un identifiant de parcelle.
- `registered_enterprises` — peut être branché plus tard via le SIREN du propriétaire (V2).

---

## 3. Schéma cible de la réponse

Extension du type `ParcelIdentifierOkPage` (`src/templates/pages/ParcelIdentifier.tsx`) avec ces nouvelles sections (toutes optionnelles) :

```
{
  // -- existant --
  title, breadcrumbs, form,
  information?, cadastre?, cap?, transactions?, "last-year-weather-reports"?, geolocation?,

  // -- nouveau --
  owners?:        { label, columns, rows[] }           // table propriétaires
  buildings?:     { label, columns, rows[] }           // bâtiments à proximité
  "natural-zones"?:        { label, columns, rows[] }  // Natura 2000 / ZNIEFF
  "protected-water-zones"?:{ label, columns, rows[] }
  "area-items"?:           { label, columns, rows[] }
  hydrography?:            { label, columns, rows[] }  // top N cours d'eau
  soil?:          Record<string, Hypermedia>           // profondeur + RU (key/value)
  "historical-yields"?:    { label, columns, rows[] }  // rendements dept × espèce × campagne
  "production-prices"?:    { label, columns, rows[] }
  "eu-market-prices"?:     { label, columns, rows[] }
}
```

Conventions à respecter (cf. `documentation/CODING-GUIDELINES.md` + `CLAUDE.md`) :
- Clés JSON en `kebab-case`.
- Chaque valeur est une `Hypermedia.*` (jamais un `string` brut côté API).
- Pas de `try/catch` ; utiliser `Result` / `Concurrently` comme l'existant.
- Pas de `switch`/`break`/`continue` ; `match()` de `shulk`.

---

## 4. Architecture d'exécution

### Principe : 2 vagues parallèles + 1 vague dépendante

Le contrôleur actuel fait 4 requêtes en parallèle (vague 1) puis 2 (vague 2 dépendante du cadastre + station). On élargit en gardant le même pattern.

**Vague 1 — point seul (toutes en parallèle, via `Concurrently`)**

| # | Requête | Source |
| --- | --- | --- |
| 1 | Municipality `ST_CONTAINS(city_shape)` | existant |
| 2 | Cadastral parcel `ST_CONTAINS(shape)` | existant |
| 3 | CAP parcel `ST_CONTAINS(shape)` | existant |
| 4 | Weather station `orderByCloseness(centroid)` | existant |
| 5 | **Natural zones `ST_CONTAINS(shape)`** | nouveau |
| 6 | **Protected water zones `ST_CONTAINS(shape)`** | nouveau |
| 7 | **Area items `ST_CONTAINS(shape)`** | nouveau |
| 8 | **Hydrography near `ST_DWithin(centroid, point, ~5km)` + tri distance** | nouveau |
| 9 | **Buildings `ST_DWithin(shape, point, ~100m)`** | nouveau |
| 10 | **Soil depth `ST_CONTAINS(shape)`** | nouveau |
| 11 | **Soil AWC `ST_CONTAINS(shape)`** | nouveau |
| 12 | **EU market prices** (filtre `country=FR` + tri date desc, top N) | nouveau, non géo |

**Vague 2 — dépendances**

- Si cadastral parcel ✅ → `ParcelPriceTable` + **`ParcelOwnerTable` joint à `CadastralOwnerTable`** (parallèle).
- Si station ✅ → `HourlyReportTable` filtré `station_id = <ref>` + `started_at >= now() - 1 year`, ordre `started_at ASC` (logique existante, à dégrouper de la dépendance au cadastre — voir B1 / P2.4).
- Si CAP parcel ✅ → **`MasterCapCodeTable` filtré `cap_code = <parcel.cap_crop_code> AND year = <YEAR>`** (cf. B2 / P2.6). `<YEAR>` est paramétré : valeur par défaut `2025` (dernière campagne disponible), surchargée par `cxt.query.year` si l'agriculteur veut consulter une campagne antérieure. Renvoyer la ligne la plus probable (filter aussi sur `production` si la parcelle en porte une, sinon `LIMIT 1`).
- Si municipality ✅ → **dériver `department_zone`** (`code` INSEE 2 premiers chars pour FR ; pour les autres pays, prévoir un fallback `undefined`) puis lancer en parallèle :
  - `master_production_yields` filtré `department_zone = <dept>` ordonné par `campaign DESC`
  - `master_production_prices` filtré idem

**Réécriture de la garde Err (B1) :** remplacer la garde "cadastral_parcel ET station obligatoires" par des branches indépendantes — chaque sous-donnée est optionnelle. Implémentation : 4 `Concurrently` indépendants (cadastre, station, CAP, commune) au lieu d'un seul `flatMap` global, chacun renvoyant `Ok(undefined)` quand sa dépendance est absente.

### Nouveaux types et tables (`Table<T>(...)`)

À créer dans `src/namespaces/GeographicalReferences/` :
- `CadastralOwner.ts` — table `registered_cadastral_owners`, PK `majic_number`.
- `CadastralParcelOwner.ts` — table `registered_cadastral_parcel_owners`, PK `id`, **avec `oneToOne: { majic_number: { table: "registered_cadastral_owners", primaryKey: "majic_number" } }`** pour bénéficier de la jointure intégrée (cf. `THINGS-TO-KNOW.md` § "DB relations") — l'interface TS fusionne les deux.
- `CadastralBuilding.ts` — table `registered_cadastral_buildings`, geometry `[shape, centroid]`.
- `NaturalZone.ts` — table `registered_natural_zones`, geometry `[shape, centroid]`.
- `ProtectedWaterZone.ts` — table `registered_protected_water_zones`, geometry `[shape, centroid]`.
- `AreaItem.ts` — table `registered_area_items`, geometry `[shape, centroid, point]`.
- `HydrographicItem.ts` — table `registered_hydrographic_items`, geometry `[shape, centroid, point]`. Nom en JSONB → typer `name: Record<string,string>` et exposer la valeur de la langue courante via `cxt.language`.
- `SoilDepth.ts`, `SoilAvailableWaterCapacity.ts` — tables `registered_soil_*`.
- **`MasterCapCode.ts`** — table `master_crop_production_cap_codes`, PK *réelle* composite `(cap_code, production, year)`. Vu que `Table<T>` actuel ne sait gérer qu'une PK simple, déclarer la table avec `primaryKey: "cap_code"` et **toujours interroger via `.where("cap_code", "=", X).where("year", "=", Y)`** côté contrôleur. Ne plus utiliser `oneToOne` sur cette table (cf. P2.6).

À créer dans `src/namespaces/Production.ts` (ou nouveau module) :
- `ProductionYieldTable` — table `master_production_yields`.
- `ProductionPriceTable` — table `master_production_prices`.

À créer dans un nouveau namespace ou Phytosanitary :
- `EuMarketPriceTable` — table `registered_eu_market_prices`.

Vérifier auparavant si l'opérateur `ST_CONTAINS` est déjà supporté dans `src/Database.ts` (`Operator` type) — il l'est. Aucune extension du builder n'est nécessaire **sauf** pour `ST_DWithin` (recherche dans un rayon) et `ST_DistanceSphere`/`orderByCloseness` (déjà utilisé pour la station). Voir tâche P1.2.

---

## 5. Découpage Epic → Story → Task

### Epic E1 — Enrichir le Parcel Identifier avec un maximum de datasets

#### Story S1 — Fondations Database/Table (pré-requis)
- **P1.1** Ajouter les nouvelles définitions `Table<T>` (8 fichiers sous `GeographicalReferences/` + 2 dans `Production.ts` + 1 ailleurs). Pas de route exposée, juste les tables réutilisables.
- **P1.2** Étendre `src/Database.ts` si nécessaire :
  - Ajouter l'opérateur `ST_DWITHIN` au type `Operator` (rayon en degrés ou via cast géographique — décision à valider).
  - Confirmer que `orderByCloseness(field, point)` est déjà exposé sur `Select<T>` (utilisé par `StationTable`). Sinon le rendre réutilisable.
- **P1.3** Décision : extraire les `Table<T>` cadastraux dans `CadastralOwner.ts` / `CadastralParcelOwner.ts` afin de pouvoir les exposer plus tard en endpoints publics (`/geographical-references/cadastral-owners` etc.) sans casser le contrôleur. **Hors scope** des endpoints publics dans cet epic ; seulement les tables.

#### Story S2 — Étendre `retrieveParcelData`
- **P2.1** Élargir la première vague `Concurrently` avec les 8 nouvelles requêtes géolocalisées + EU market prices.
- **P2.2** Ajouter une branche "owners" dépendante du cadastre (jointure intégrée via `oneToOne` sur `CadastralParcelOwnerTable`).
- **P2.3** Ajouter une branche "yields/prices département" dépendante de la municipalité : extraire le département du code INSEE (`code.slice(0, 2)` pour FR, prévoir `country !== "FR"` → skip).
- **P2.4 — Bug fix B1 (météo).** Remplacer le `flatMap` global "cadastre+station obligatoires" par des `Concurrently` indépendants pour que chaque section soit autonome :
  - Branche cadastre : si `cadastralParcels[0]` → lancer `ParcelPriceTable.where("cadastral_parcel_id", "=", id)` + `CadastralParcelOwnerTable.where("cadastral_parcel_id", "=", id)` ; sinon `Ok(undefined)`.
  - Branche station : si `stations[0]` → lancer `HourlyReportTable.where("station_id", "=", ref).where("started_at", ">=", oneYearAgo).orderBy("started_at", "ASC")` ; sinon `Ok(undefined)`.
  - Branche CAP : voir P2.6.
  - Branche commune : voir P2.3.
  **Acceptation B1 :** sur le point test (`45.8275731903227, -0.7837...`), la section `last-year-weather-reports` doit s'afficher (station SAINTES FR17415003, ~8 700 points sur 1 an) **même si** `cadastre` est absent.
- **P2.5** Mettre à jour le type de retour de `retrieveParcelData` pour inclure les 11+ nouveaux champs (tous optionnels).
- **P2.6 — Bug fix B2 (CAP join).** Réécrire la résolution du libellé culture PAC :
  1. Retirer la déclaration `oneToOne: { cap_crop_code: ... }` de `CapParcelTable` (`src/namespaces/GeographicalReferences/CapParcel.ts`) et nettoyer l'interface `CapParcel` (séparer `cap_code/cap_label/production/year` qui n'appartiennent plus à la parcelle).
  2. Ajouter une requête dédiée `MasterCapCodeTable(db).select().where("cap_code", "=", capParcel.cap_crop_code).where("year", "=", YEAR).limit(1)` dans la branche dépendante "CAP parcel" (P2.4 / vague 2).
  3. `YEAR` : constante `CAP_CODE_YEAR = 2025` au sommet du fichier, surchargée par `cxt.query.year` si fourni (valider `2017..2025`).
  4. Si `production` est non-null sur la parcelle (n'est pas le cas dans la DB actuelle, mais prévoir), affiner avec `.where("production", "=", X)` pour lever l'ambiguïté PK composite.
  5. Exposer dans la section `cap` du `Hypermedia` mapping : `cap_code`, `cap_label`, `production`, `cap_precision`, `cap_category`, `is_seed`, `year` (et lien hypermedia vers la culture si jamais une page production existe).
  **Acceptation B2 :** pour une parcelle PAC avec `cap_crop_code = "BTH"`, la section `cap` doit renvoyer `cap_label = "Blé tendre d'hiver"` et `year = 2025`, de manière reproductible (pas de variation entre requêtes).

#### Story S3 — Mapper en `Hypermedia` dans le contrôleur
- **P3.1** Étendre `ParcelIdentifierOkPage` (`src/templates/pages/ParcelIdentifier.tsx`) avec les nouvelles sections optionnelles.
- **P3.2** Dans `ParcelIdentifierController.Some` branch, construire les nouvelles sections — `Hypermedia.Text/Number/Link` + tableaux pour les listes. Conventions : clés `kebab-case`, libellés via `cxt.t(...)`.
- **P3.3** Pour les sections de type tableau (owners, buildings, natural-zones, hydrography, yields, prices, eu-prices), suivre exactement la forme du bloc `transactions` existant (`{ label, columns, rows[] }`) pour minimiser le travail template.
- **P3.4** Pour la section `soil`, c'est un `Record<string, Hypermedia>` simple (comme `cadastre`).
- **P3.5** Pour `hydrography.name` (JSONB multilangue), résoudre via `name[cxt.language] || name.fra` (clés stockées en `fra` dans la DB).
- **P3.6** Pour `owners`, masquer/anonymiser les personnes physiques quand `person_group_code` indique une personne physique (cf. § 7 — RGPD).

#### Story S4 — Mise à jour du template HTML
- **P4.1** `ParcelIdentifier.tsx` : appeler `renderSection` pour chaque nouveau bloc de type clé/valeur (`soil`).
- **P4.2** Dupliquer le pattern `transactions` (table) pour les 7 nouvelles sections de type tableau. Envisager d'extraire un sous-composant `<TableSection />` pour limiter la duplication (refactor mineur, pas un bloqueur).
- **P4.3** Étendre `renderHypermedia` interne avec les variantes qui apparaîtront dans les nouvelles colonnes (au minimum `Boolean` pour `is_seed`, `Datum` si besoin pour les RU).
- **P4.4** Ajouter les traductions FR/EN dans `src/assets/translations.csv` pour tous les nouveaux libellés (`tools_owners`, `tools_buildings`, `tools_natural_zones`, `tools_protected_water_zones`, `tools_hydrography`, `tools_soil_depth`, `tools_soil_available_water`, `tools_historical_yields`, `tools_production_prices`, `tools_eu_market_prices`, etc., plus libellés de colonnes). **⚠️ Le serveur ne hot-reload pas le CSV** — redémarrer après modification.

#### Story S5 — Validation
- **P5.1** Tester `GET /tools/parcel-identifier?latitude=45.8275731903227&longitude=-0.783718835725218` (HTML + `.json`).
  - **Attendu présent** : `information` ✅, `natural-zones` ✅ (2 — ZPS Estuaire Charente, SIC Vallée Charente), `hydrography` ✅ (5, "le Bruant" à 49 m), `soil` ✅ (30 cm / <50 mm), `historical-yields` ✅ (dept 17, ≥10 espèces pour 2020), `buildings` ✅ (≥5), **`last-year-weather-reports` ✅ (station SAINTES FR17415003, ~8 700 points sur 1 an, dernier point ≤ 7 j de la date courante).**
  - **Attendu manquant** : `cadastre`, `cap`, `owners`, `transactions`, `protected-water-zones`, `area-items` (tous `undefined` → sections masquées).
- **P5.2 — Validation B2 (CAP année).** Choisir un point PAC connu (ex. `SELECT postgis.ST_X(centroid), postgis.ST_Y(centroid) FROM registered_graphic_parcels WHERE city_name = 'Saint-Porchaire' AND cap_crop_code = 'BTH' LIMIT 1`) et vérifier que la section `cap` renvoie `cap_label = "Blé tendre d'hiver"`, `year = 2025`. Surcharger via `?year=2024` et confirmer que le libellé/production peut différer (vérification de la paramétrabilité).
- **P5.3 — Validation B1 (météo).** Sur le point test (sans cadastre), confirmer **explicitement** que la section `last-year-weather-reports` est présente (graphe HTML + clés dans `.json`). Avant le fix, ce champ est `undefined` ; après le fix, il contient au moins ~8 000 points horaires.
- **P5.4** Tester un point AVEC parcelle cadastrale couverte pour valider owners + transactions (point à choisir via `SELECT postgis.ST_AsText(centroid) FROM registered_cadastral_parcels LIMIT 1`).
- **P5.5** Tester `.json` et vérifier la structure (kebab-case, présence des libellés, hyperliens).
- **P5.6** Tester un point hors France pour valider le fallback `department_zone` (yields/prices doivent être absents, pas une erreur).
- **P5.7** Mesurer la latence avant/après. Plafond suggéré : pas plus de +30% sur le point test (12 requêtes parallèles vague 1 + 4 dépendantes vague 2, toutes indexées GIST/btree).

---

## 6. Dépendances et ordre d'exécution

```
S1 (Tables)
  └─► S2 (Controller data layer)
        └─► S3 (Hypermedia mapping)
              ├─► S4 (Template) ──┐
              └─► (CSV traductions)──┴─► S5 (Validation)
```

Parallélisme possible : P4.4 (traductions) peut démarrer dès que les libellés sont décidés (en parallèle de S2/S3).

---

## 7. Risques & points d'attention

1. **RGPD — propriétaires personnes physiques.** `registered_cadastral_owners.denomination` peut contenir un nom + prénom. Pour les `person_group_code` correspondant à des personnes physiques, **masquer** (afficher seulement `legal_form_short` + ville) ou ne pas exposer du tout par défaut. Décision produit requise avant de merger. À défaut, désactiver la section `owners` derrière une variable d'env (`EXPOSE_OWNERS=false` par défaut) en V1.
2. **Performance.** 12 requêtes parallèles vague 1 + 3 dépendantes. Tous les filtres spatiaux passent par des index GIST existants (vérifié dans `\d`), donc OK, mais à mesurer sur un point urbain (plus de bâtiments, plusieurs polygones).
3. **`department_zone` non couvert hors France.** Le code INSEE FR donne le département via `code.slice(0,2)` (sauf Corse `2A/2B` → traiter `20` ou regex). Pour d'autres pays, `country !== "FR"` → ne pas appeler les requêtes yields/prices.
4. **JSONB multilangue.** `registered_hydrographic_items.name` et `registered_area_items.name` sont `jsonb`. Le builder `Select` actuel ne sait pas projeter `name->>'fra'` — la valeur revient en `Record<string,string>` côté TS. À résoudre côté handler (`(row.name as any)[cxt.language] ?? (row.name as any).fra`) plutôt que côté SQL.
5. **Historique CAP : table parcellaire en snapshot, dictionnaire codes multi-année.** `registered_graphic_parcels` est un snapshot unique (pas de dimension `year` ni d'historique de culture par parcelle). En revanche, `master_crop_production_cap_codes` contient **9 millésimes (2017→2025, 208 entrées en 2025)** : on peut résoudre le libellé de culture pour n'importe quelle année, mais la culture *exposée* reste celle déclarée dans le snapshot parcellaire. Choix de design : afficher la culture du snapshot avec le millésime `year=2025` par défaut (cf. P2.6), paramétrable via `?year=YYYY`. L'historique pluri-annuel par parcelle reste **non disponible** ; documenter cette limitation côté API/UI ; ne pas inventer.

8. **PK composite non gérée par `Table<T>`.** L'abstraction `Table<T>` actuelle (`src/Database.ts`) ne supporte qu'une PK simple. `master_crop_production_cap_codes` a une PK composite `(cap_code, production, year)`. Conséquence : ne pas utiliser `oneToOne` sur cette table (cf. B2), interroger explicitement via `.where(...).where(...)`. Si plus tard d'autres tables composites apparaissent, envisager d'étendre `Table<T>` pour accepter `primaryKey: (keyof T)[]` ; **hors scope** de cet epic.
6. **`ST_DWithin` en degrés.** L'opérateur travaille en EPSG:4326 (degrés). Un rayon de 0.05° ≈ 5.5 km à cette latitude, suffisant pour l'hydrographie. Pour un rayon strict en mètres il faudrait caster `geography` — l'extension `postgis` est dispo (vu dans le `\d`), `centroid::postgis.geography` fonctionnerait. Décision : rester en degrés en V1, doc explicite.
7. **API publique stable.** Conformément au § 8 de `CODING-GUIDELINES.md` ("user land is sacred"), les nouveaux champs sont **ajoutés** ; aucun champ existant n'est renommé ni supprimé. La forme JSON pré-existante reste rétro-compatible.

---

## 8. Critères de complétion

- [ ] 11 nouveaux datasets branchés dans `retrieveParcelData` (cf. § 4, vague 1 entrées 5-12 + vague 2 owners + yields + prices).
- [ ] **B1 (P2.4) — Météo affichée sans cadastre.** Sur le point test, la section `last-year-weather-reports` apparaît (station SAINTES, ≥8 000 points sur 1 an).
- [ ] **B2 (P2.6) — Jointure CAP pinned à `year=2025`.** La déclaration `oneToOne` est retirée de `CapParcelTable` ; le contrôleur interroge explicitement `master_crop_production_cap_codes` avec `cap_code` ET `year` ; surcharge `?year=YYYY` opérationnelle.
- [ ] Type `ParcelIdentifierOkPage` mis à jour, toutes les nouvelles sections optionnelles.
- [ ] Template HTML rend chaque nouvelle section (avec masquage si `undefined`).
- [ ] Sorties `.json` valides (kebab-case, hyperliens vers les ressources liées quand pertinent).
- [ ] Traductions FR/EN ajoutées dans `translations.csv`.
- [ ] Décision RGPD documentée et appliquée pour `owners`.
- [ ] Test manuel sur le point fourni + un point cadastré + un point PAC connu (Saint-Porchaire) + un point hors FR.
- [ ] Aucune régression sur les sections existantes.

---

## 9. Prochaine étape

L'implémentation peut démarrer par S1 (création des `Table<T>`), qui est purement additive et sans risque. Lancer ensuite via `/sc:implement` ou un agent `feature-dev:code-architect` en suivant l'ordre §6.
