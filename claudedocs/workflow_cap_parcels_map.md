## Workflow — Carte des parcelles PAC par culture

**Cible :** `src/namespaces/GeographicalReferences/CapParcelAPI.ts` (+ `index.ts`, `Map.tsx`)
**Endpoint visé :** `GET /geographical-references/cap-parcels/map` (HTML), `.geojson` auto via `API.path`.
**Persona :** agriculteur / technicien — veut visualiser les parcelles PAC d'une commune sur une carte, colorées par culture, avec une légende.

> Plan d'implémentation **uniquement**. Aucun code n'est modifié ici. Lancer `/sc:implement` ensuite.

---

### 1. Lecture du besoin

> « Affiche une carte des parcelles enregistrées à la PAC (`/geographical-references/cap-parcels`) dans le menu `/geographical-references` avec une catégorie par culture. »

Trois ambiguïtés à trancher avant d'implémenter — voir § 2 pour la recommandation par défaut :

| # | Ambiguïté | Options |
|---|-----------|---------|
| Q1 | Où afficher la carte ? | (a) **Nouvelle sous-route `/geographical-references/cap-parcels/map`** (recommandé), (b) Modifier la route existante `cap-parcels` (casse la table actuelle), (c) Ajouter un section "carte" dans le tableau existant (nécessite d'étendre `generateTablePage`). |
| Q2 | Quelle granularité de catégorisation ? | (a) Par `cap_label` (libellé de la culture, ex. "Blé tendre d'hiver" — fort cardinal, ~200), (b) **Par `cap_category`** (catégorie agrégée, ex. "Céréales" — cardinal faible, plus lisible, recommandé), (c) Par `production` (intermédiaire). |
| Q3 | Comment scoper la carte ? | (a) **Commune obligatoire** (recommandé — même pattern que `MunicipalityAPI` `/municipalities/:id/cap-parcels`), (b) Bounding box paramétré, (c) Tout afficher (impossible : la table couvre toute la France métropolitaine, ~10⁶+ polygones). |

Réponses utilisateur
Q1 : (a)
Q2 : (b)
Q3 : (a)

---

### 2. État actuel

`src/namespaces/GeographicalReferences/CapParcelAPI.ts` expose déjà :

| Route | Vue | Notes |
|-------|-----|-------|
| `GET /geographical-references/cap-parcels` | **Tableau** (filtre `city` actif, `culture` commenté ligne 36-39 et 44-46) | `oneToOne` flatten de `master_crop_production_cap_codes` → `cap_label` disponible mais non déterministe sur l'année (cf. workflow `parcel_identifier_enrichment.md` § 1 / B2). |
| `GET /geographical-references/cap-parcels/:id` | Page ressource | Mêmes champs. |
| `GET /geographical-references/cap-parcels/:id/geolocation` | **Carte mono-parcelle** | Utilise `generateMapSection({ center, markers, shapes: [parcel.shape] })`. |

`src/namespaces/GeographicalReferences/index.ts` (ligne 26-50) déclare le menu `/geographical-references` via `AutoList`, avec 4 liens (cadastre, **cap-parcels**, communes, valeurs foncières).

**Pattern de référence existant** — `MunicipalityAPI.ts` lignes 248-287 fait exactement ce qu'on veut, mais scopé à *une* commune via `/geographical-references/municipalities/:id/cap-parcels` : `ST_WITHIN(municipality.city_shape)` → `generateMapSection` avec `properties.html` (popup) et `properties.href` (lien) par feature. **Il ne fait pas de catégorisation par culture** — toutes les parcelles sont rendues sans style différencié. C'est cette pièce qu'on doit étendre, et la généraliser dans la route `cap-parcels`.

`src/templates/components/Map.tsx` :
- N'a pas de prop `legend` ni de `style` global — c'est `feature.properties.style` qui est consommé par `styleFeature` (ligne 56-60). Le style est donc déjà **par-feature**, on n'a pas besoin de toucher au composant `Map` pour colorier différemment chaque polygone.
- **N'a pas non plus de légende** — il faudra l'ajouter (rendu HTML statique sous/à côté du `<div id="map-…">` ou via `L.control` côté script).

`src/Database.ts` :
- L'opérateur `ST_WITHIN` est supporté (ligne 60).
- Pas de support natif `ST_DWithin` ni de bbox — mais on n'en a pas besoin si on scope par commune.
- `.distinct()` est supporté (ligne 91) — utile pour récupérer la liste des `cap_category` distinctes pour la légende.

---

### 3. Recommandation de design

**Route :** `GET /geographical-references/cap-parcels/map`
**Auto-générées par `API.path` :** `.json` (FeatureCollection metadata), `.geojson` (FeatureCollection brute, retournée par `generateMapSection` quand `cxt.output === "geojson"`), `.csv` (probablement vide / liste tabulaire, à décider).

**Form (HTML) :**
- `city` (Field.Text, **requis** — sans cette contrainte le rendu est impossible).
- `category` (Field.Select, optionnel — liste des `cap_category` distinctes pour filtrer).

**Comportement :**
1. Sans `city` : afficher la page avec le formulaire seul + un message d'aide (`cxt.t("geographical_references_cap_parcel_map_help")`).
2. Avec `city` : retourner `ST_WITHIN(municipality.city_shape)` + grouper les parcelles par `cap_category` (ou `cap_label` selon Q2), assigner une couleur stable par catégorie, rendre la carte + la légende.
3. Avec `city` + `category` : ne rendre que les parcelles de la catégorie sélectionnée.

Réponse 2.

**Scoping de sécurité (volume) :**
- `LIMIT 5000` côté requête pour blinder un cas pathologique (commune très grande × culture très courante). À 5000 polygones, Leaflet reste utilisable.
- Si la requête atteint la limite, afficher un avertissement (`cxt.t("…_map_limit_warning")`).

**Catégorisation (Q2) — recommandé : `cap_category`.**
- Cardinal faible (~10-20 catégories en France), légende lisible, palette de couleurs gérable.
- `cap_label` reste accessible dans le popup de chaque parcelle (`properties.html`).
- ⚠️ La colonne `cap_category` vient du dictionnaire `master_crop_production_cap_codes` via `oneToOne`. Cette jointure est **non déterministe sur l'année** (cf. workflow `parcel_identifier_enrichment.md` § 1 / B2). Décision à prendre :
  - **Option α (rapide, V1)** : continuer à utiliser le `oneToOne` actuel et accepter l'imprécision (le bug B2 est trackke ailleurs). Couleur potentiellement instable d'une requête à l'autre pour les parcelles dont le `cap_code` a des labels variables selon l'année.
  - **Option β (propre)** : aligner sur le fix B2 du workflow Parcel Identifier — retirer le `oneToOne`, faire une jointure explicite côté handler avec `MasterCapCodeTable.where("cap_code", "=", X).where("year", "=", 2025)`. Plus de travail, mais cohérent. **Recommandé si B2 est traité dans la même PR.**
- Choix par défaut du plan : **Option α en V1**, migration vers β dès que B2 est mergé.

**Palette de couleurs :**
- 12 couleurs distinctes (Tableau D3-Category10 + 2) hardcodées dans un module utilitaire `src/utils/colors.ts` (à créer), assignées par hash stable du nom de catégorie pour qu'une catégorie ait toujours la même couleur entre requêtes.
- Catégorie inconnue / `undefined` → gris neutre `#999999`.

**Menu (`index.ts`) :**
- Ajouter un 5ᵉ lien dans `AutoList.links` :
  ```ts
  Hypermedia.Link({
    value: cxt.t("geographical_references_cap_parcel_map_title"),
    method: "GET",
    href: "/geographical-references/cap-parcels/map",
  })
  ```
- Position : juste après l'entrée "cap-parcels" existante (cohérence visuelle).

---

### 4. Architecture d'exécution

#### Flux du handler `cap-parcels/map`

```
GET /geographical-references/cap-parcels/map?city=<name>[&category=<cap_category>]
  │
  ├── 1. Valider le form
  │    ├── city absent → rendre la page form-only (HTML) ou 400 (JSON/GeoJSON)
  │    └── city présent → continuer
  │
  ├── 2. Résoudre la commune
  │    └── MunicipalityTable.select().where("city_name", "LIKE", "%city%").limit(1)
  │       → si Err / vide → 404 ou message
  │       → exposer city_shape, city_centroid
  │
  ├── 3. Charger les parcelles
  │    └── CapParcelTable
  │         .select("id", "cap_crop_code", "shape", "cap_label", "cap_category")
  │         .where("shape", "ST_WITHIN", city_shape)
  │         .where("cap_category", "=", category)   // si fourni
  │         .limit(5000)
  │         .run()
  │
  ├── 4. (En parallèle de 3) Charger la liste des catégories distinctes pour la légende
  │    └── CapParcelTable
  │         .select("cap_category").distinct()
  │         .where("shape", "ST_WITHIN", city_shape)
  │         .run()
  │       → liste affichée dans le Field.Select du form (ou dérivée de la requête 3 — voir P2.3)
  │
  ├── 5. Construire le GeoJSON (par parcelle)
  │    └── { ...parcel.shape, properties: { style: { color: colorFor(category), fillOpacity: 0.5 }, html: popup, href } }
  │
  └── 6. Output dispatch
       ├── geojson → renvoyer directement la FeatureCollection (generateMapSection le fait déjà)
       └── html   → renvoyer Map({ center: city_centroid, markers: [], shapes }) + Legend(categories)
```

#### Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `src/utils/colors.ts` | Palette + `colorFor(label: string): string` (hash → indice palette, ou map prédéfinie). |
| `src/templates/components/MapLegend.tsx` | Composant légende : reçoit `{ label, color }[]`, rend une liste à puces colorée sous la carte. |

#### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `src/namespaces/GeographicalReferences/CapParcelAPI.ts` | Ajouter `.path("/geographical-references/cap-parcels/map", handler)`. |
| `src/namespaces/GeographicalReferences/index.ts` | Ajouter le lien menu (ligne ~36-39 cf. § 3). |
| `src/page-generators/generateMapSection.ts` | Étendre la signature pour accepter `legend?: { label, color }[]` et le passer à `Map(...)` côté HTML. |
| `src/templates/components/Map.tsx` | Accepter `legend?` et rendre `<MapLegend />` sous la carte. **Optionnel V1** — alternative : la légende est rendue par le handler en dehors du composant `Map`. |
| `src/assets/translations.csv` | Nouvelles clés (voir § 5 P5). ⚠️ Restart serveur obligatoire (cf. CLAUDE.md). |

---

### 5. Découpage Epic → Story → Task

#### Epic E1 — Carte des parcelles PAC par culture

##### Story S1 — Fondations utilitaires (additif, sans risque)

- **P1.1** Créer `src/utils/colors.ts` :
  - Palette `PALETTE = ["#5470C6", "#EE6666", "#91CC75", "#FAC858", "#73C0DE", "#3BA272", "#FC8452", "#9A60B4", "#EA7CCC", "#5470C6", "#2E8B57", "#B22222"]`.
  - `colorFor(label: string | undefined): string` → hash (somme des charCodes mod `PALETTE.length`) ; `undefined` / vide → `#999999`.
  - Fonction pure, pas de side-effects. Pas de test unitaire (pas de framework dans le projet) — vérification manuelle suffisante.

- **P1.2** Créer `src/templates/components/MapLegend.tsx` :
  - Props : `{ items: { label: string; color: string }[] }`.
  - Rend une `<ul>` stylée minimaliste : pastille colorée + libellé, sous la carte.
  - JSX via `Html.createElement` comme les autres composants.

##### Story S2 — Endpoint `cap-parcels/map` (cœur de l'epic)

- **P2.1** Ajouter une 4ᵉ chaîne `.path("/geographical-references/cap-parcels/map", async (cxt) => …)` dans `CapParcelAPI.ts`. **Important** : le format de retour doit pouvoir être (a) une page HTML, (b) une `FeatureCollection` GeoJSON. Utiliser `match(cxt.output)` comme `generateMapSection` le fait déjà, OU déléguer à `generateMapSection` directement.

- **P2.2** Récupérer la commune :
  ```ts
  const municipalityResult = await MunicipalityTable(cxt.db)
    .select()
    .where("city_name", "LIKE", `%${city.toUpperCase()}%`)
    .limit(1)
    .run()
  ```
  Sur miss → renvoyer un message vide (HTML) ou `NotFound` (JSON).

- **P2.3** Récupérer les parcelles **+ les catégories distinctes** en parallèle (deux `await` sur deux Promises) :
  ```ts
  const [parcelsResult, categoriesResult] = await Promise.all([
    CapParcelTable(cxt.db).select("id", "cap_crop_code", "shape", "cap_label", "cap_category")
      .where("shape", "ST_WITHIN", municipality.city_shape)
      .limit(5000)
      .run(),
    CapParcelTable(cxt.db).select("cap_category").distinct()
      .where("shape", "ST_WITHIN", municipality.city_shape)
      .run(),
  ])
  ```
  ⚠️ La 2ᵉ requête peut être coûteuse (DISTINCT sur 5000+ rows). **Alternative** : déduire les catégories *côté JS* après P2.3 step 1 (`new Set(parcels.map(p => p.cap_category))`). Recommandé — une seule requête DB suffit.

- **P2.4** Si `cxt.query.category` est présent, filtrer côté SQL via `.where("cap_category", "=", cxt.query.category)`.

- **P2.5** Mapper en GeoJSON features avec style et popup, en suivant le pattern `MunicipalityAPI.ts` lignes 263-274 :
  ```ts
  const features = parcels.map((parcel) => ({
    ...parcel.shape,
    properties: {
      style: { color: colorFor(parcel.cap_category), fillOpacity: 0.5, weight: 1 },
      href: `/geographical-references/cap-parcels/${parcel.id}`,
      html: `<b>${parcel.cap_label ?? parcel.cap_crop_code}</b><br/>
             <a href="/geographical-references/cap-parcels/${parcel.id}">${cxt.t("common_see")}</a>`,
    },
  }))
  ```

- **P2.6** Output dispatch — utiliser `generateMapSection({ output: cxt.output, center: pointToCoordinates(municipality.city_centroid), markers: [], shapes: features })`. Pour la légende HTML, deux options :
  - **Option α** : étendre `generateMapSection` pour qu'il accepte `legend` et le rende sous la carte (toucher au generator).
  - **Option β** : rendre la légende **en dehors** de `generateMapSection`, en concaténant `<MapLegend />` au résultat HTML dans le handler. Plus simple, pas d'extension du generator. **Recommandé V1.**

- **P2.7 — Garde-fou volume.** Si `parcels.length >= 5000`, ajouter un avertissement dans la réponse HTML (et un champ `truncated: true` dans la réponse JSON). Conseiller un filtrage par catégorie.

##### Story S3 — Form et UX

- **P3.1** Construire le form (Field.Text city requis + Field.Select category optionnel) :
  - `city` : `required: true`.
  - `category` : `required: false`, `options` construit à partir des catégories distinctes (idéalement pré-calculées, sinon hardcoder une liste statique au premier passage). **V1 simple** : un `Field.Text` libre pour `category` plutôt qu'un Select dynamique (le Select dynamique nécessite de connaître les options *avant* le rendu du form, ce qui obligerait un appel DB systématique au load — overkill V1).
- **P3.2** Sans `city`, rendre la page avec uniquement le form + message d'aide. Utiliser un pattern proche de `MunicipalityAPI` (qui exige une commune avant la map cadastre/cap).
- **P3.3** Breadcrumbs : `[home, geographical_references, cap-parcels, map]`.

##### Story S4 — Menu et navigation

- **P4.1** Modifier `src/namespaces/GeographicalReferences/index.ts` lignes ~36-39 pour ajouter le 5ᵉ lien menu :
  ```ts
  Hypermedia.Link({
    value: t("geographical_references_cap_parcel_map_title"),
    method: "GET",
    href: "/geographical-references/cap-parcels/map",
  }),
  ```
  À insérer **après** le lien `cap-parcels` (ligne 36-39 actuel) pour grouper visuellement.
- **P4.2** Ajouter un lien depuis la page table actuelle `/geographical-references/cap-parcels` vers `/cap-parcels/map` (cross-link UX, optionnel V1).

##### Story S5 — Traductions

- **P5.1** Ajouter dans `src/assets/translations.csv` :
  - `geographical_references_cap_parcel_map_title,Carte des parcelles PAC,CAP parcels map`
  - `geographical_references_cap_parcel_map_help,Saisissez le nom d'une commune pour afficher la carte des parcelles PAC.,Enter a city name to display the CAP parcels map.`
  - `geographical_references_cap_parcel_map_legend,Légende,Legend`
  - `geographical_references_cap_parcel_map_truncated,Trop de parcelles à afficher — filtrez par catégorie.,Too many parcels to display — filter by category.`
  - `geographical_references_cap_parcel_map_category,Catégorie de culture,Crop category`
- **P5.2** ⚠️ **Redémarrer le serveur** après modification du CSV (cf. CLAUDE.md — pas de hot reload sur translations.csv).

##### Story S6 — Validation

- **P6.1** `GET /geographical-references` (HTML) → vérifier que le nouveau lien "Carte des parcelles PAC" apparaît.
- **P6.2** `GET /geographical-references/cap-parcels/map` (HTML, sans param) → page form-only, pas d'erreur.
- **P6.3** `GET /geographical-references/cap-parcels/map?city=Saint-Porchaire` → carte rendue, parcelles colorées par catégorie, popup au clic.
  - Acceptation : ≥ 1 polygone visible, ≥ 2 couleurs distinctes si la commune a ≥ 2 catégories de cultures.
  - Vérifier que le lien dans le popup (`/geographical-references/cap-parcels/<id>`) fonctionne.
- **P6.4** `GET /geographical-references/cap-parcels/map.geojson?city=Saint-Porchaire` → `FeatureCollection` valide. Vérifier qu'un client GeoJSON tiers (geojson.io) l'accepte.
- **P6.5** `GET /geographical-references/cap-parcels/map?city=<commune-tres-grande>` → vérifier le garde-fou `LIMIT 5000` + l'avertissement de troncature.
- **P6.6** `GET /geographical-references/cap-parcels/map?city=Saint-Porchaire&category=Céréales` → seulement les parcelles de cette catégorie.
- **P6.7** `GET /geographical-references/cap-parcels/map?city=ZZZZZ` (commune inexistante) → message clair, pas de 500.
- **P6.8** Tester la légende : les couleurs affichées correspondent aux features rendues.
- **P6.9** Régression : `/geographical-references/cap-parcels` (table existante) et `/geographical-references/cap-parcels/:id/geolocation` (carte mono-parcelle) doivent rester intacts.

---

### 6. Dépendances et ordre d'exécution

```
S1 (utils colors + MapLegend)
  └─► S2 (handler /cap-parcels/map)
        └─► S3 (form + UX)
              ├─► S4 (menu)
              └─► S5 (translations) ──► restart serveur
                    └─► S6 (validation)
```

Parallélisable : S5 (CSV) peut démarrer dès que les libellés sont décidés (en parallèle de S2/S3).

---

### 7. Risques & points d'attention

1. **Volume — déjà couvert par `LIMIT 5000` + scope commune obligatoire.** Une commune urbaine dense pourrait approcher la limite ; surveiller.

2. **`cap_category` non déterministe (bug B2 du workflow Parcel Identifier).** Le `oneToOne` actuel sur `master_crop_production_cap_codes` peut renvoyer une catégorie variable selon les exécutions (PK composite `(cap_code, production, year)` non disambiguïsée). Conséquence : la couleur d'une parcelle peut **changer** d'une requête à l'autre. Trois mitigations :
   - α (V1, retenu) : ignorer et documenter.
   - β : aligner avec le fix B2 (jointure explicite `where("year", "=", 2025)`) — recommandé si B2 est mergé en parallèle.
   - γ : pin sur `year` paramétrable `?year=YYYY`.
   **Décision V1 : α + suivi via le ticket de B2.**

3. **Performance Leaflet à 5000 polygones.** Chaque feature est ajoutée via `L.geoJSON(...).addTo(map)` (cf. `Map.tsx` ligne 23-30). Ça génère 5000 appels DOM. Si lent, alternative : regrouper en **une seule** FeatureCollection puis un seul `L.geoJSON`. Optimisation V2.

4. **Légende dynamique vs statique.** Si on opte pour le Select dynamique (P3.1), il faut connaître les catégories disponibles *avant* de rendre le form — soit un appel DB systématique au load (coûteux), soit deux passes. **V1 retenu : Field.Text libre.** V2 : passer en Select dynamique alimenté par une requête `cap_category DISTINCT` au moment de l'affichage du form.

5. **API publique stable** (cf. `documentation/CODING-GUIDELINES.md` § "user land is sacred"). La nouvelle route est **additive**. Aucun champ existant n'est modifié. La table `/cap-parcels` reste inchangée.

6. **Restart serveur obligatoire après CSV** (cf. CLAUDE.md `--hot` ne reload pas `translations.csv`). Penser à le faire dans l'ordre P5 → S6.

7. **Pas de hot-reload côté Map JS.** Le composant `Map.tsx` injecte un `<script>` inline avec un `uniqid = Date.now()`. Si deux maps coexistent dans la même page (cas peu probable ici), le pattern fonctionne. Pas d'action.

8. **CSV pour `/cap-parcels/map.csv` ?** Comportement par défaut de `.path` : auto-générer la variante `.csv`. La carte n'a pas de représentation CSV utile. Trois options :
   - α : laisser `.csv` retourner les attributs des parcelles (id, cap_crop_code, cap_label, cap_category) — utile pour export.
   - β : retourner un 406 explicite pour `.csv`.
   - γ : forcer un fallback HTML.
   **Décision V1 : α (export tabulaire), si le format `output` ne match pas geojson/html alors renvoyer un tableau Hypermedia comme la route table existante.**

9. **`Field.Text` pour `city` vs `Field.Select` lié à `MunicipalityTable`.** Saisir un nom libre = risque de typo. Une amélioration V2 : un Select avec autocomplete sur `MunicipalityTable` (nécessite endpoint AJAX, hors scope V1).

---

### 8. Critères de complétion

- [ ] Nouvelle route `GET /geographical-references/cap-parcels/map` exposée (HTML + `.geojson` + `.json`).
- [ ] Form avec `city` (requis) et `category` (optionnel) opérationnel.
- [ ] Sans `city` : page form-only sans erreur 500.
- [ ] Avec `city` valide : carte rendue, ≥ 2 couleurs distinctes par catégorie (sur une commune à plusieurs cultures).
- [ ] Popup parcelle avec lien vers `/geographical-references/cap-parcels/:id`.
- [ ] Légende affichée sous la carte, couleurs cohérentes avec les features.
- [ ] Garde-fou `LIMIT 5000` + avertissement de troncature.
- [ ] Nouveau lien menu dans `/geographical-references` (5ᵉ entrée).
- [ ] Traductions FR/EN ajoutées, serveur redémarré.
- [ ] Aucune régression sur `/geographical-references/cap-parcels` (table) ni sur `/geographical-references/cap-parcels/:id/geolocation` (carte mono-parcelle).
- [ ] Code conforme à `documentation/CODING-GUIDELINES.md` : pas de `try/catch`, pas de `switch`, `Result` pour les fallibles, clés `kebab-case`.

---

### 9. Prochaine étape

Démarrer par **S1** (utilitaires couleurs + composant légende) — additif, zéro risque. Puis S2 (handler). Lancer via `/sc:implement` ou un agent `feature-dev:code-architect` en suivant § 6.

Avant `/sc:implement`, **valider explicitement avec l'utilisateur** :
1. Q1 — route `/cap-parcels/map` (recommandé) vs autre.
2. Q2 — `cap_category` (recommandé) vs `cap_label`.
3. Q3 — scope par `city` obligatoire (recommandé).
4. Décision Option α vs β pour la jointure `master_crop_production_cap_codes` (cf. § 3 et risque #2).
