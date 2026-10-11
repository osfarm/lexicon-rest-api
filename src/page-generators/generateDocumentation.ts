import { match } from "shulk"
import packageJson from "../../package.json"
import { Hypermedia } from "../Hypermedia"
import { ProductState, ProductType } from "../namespaces/Phytosanitary"
import { VineCategory, VineColor } from "../namespaces/Viticulture"
import { Documentation } from "../templates/pages/Documentation"
import type { Translator } from "../Translator"
import { Country } from "../types/Country"
import { ActivityFamily, ProductionUsage } from "../namespaces/Production"
import type { OutputFormat } from "../types/OutputFormat"
import { INPUT_RESOURCES, titleOfInput } from "../namespaces/Inputs"

const loadExample = (name: string): Promise<object> =>
  Bun.file(`./src/assets/examples/${name}`).json()

const examples = {
  capParcels: await loadExample("cap-parcels-saint-porchaire.json"),
  capParcel: await loadExample("cap-parcel-463509.json"),
  capParcelsMap: await loadExample("cap-parcels-map-saint-porchaire.json"),
  capParcelsMapGeo: await loadExample("cap-parcels-map-saint-porchaire.geojson.json"),
  municipalities: await loadExample("municipalities-saint-porchaire.json"),
  municipality: await loadExample("municipality-st-porchaire.json"),
  parcelIdentifier: await loadExample("parcel-identifier-saint-porchaire.json"),
}

const Paths = (t: Translator) => ({
  "/tools/parcel-identifier.json": {
    get: ResourceEndpoint({
      description:
        t("tools_parcel_identifier") +
        " (JSON). Everything Lexicon knows at a point: commune (the arrondissement in Paris, Lyon and Marseille), cadastral parcel, CAP parcel and the crops declared there campaign by campaign (rotation), what Lexicon holds about that crop (crop-context: selling price, gross product per hectare, authorised plant protection products, R&D documents, technical workflows), buildings on the parcel with their ground area, soil, water within about 500 m with its distance in metres and what the IGN says of it (water: permanent, ditch, water-police « Inscrit » for a watercourse listed by the water police, width), what stands around the cadastral parcel (surroundings: dwellings within 100 m and the closest one, schools, hospitals and homes for the elderly within 500 m, metres of hedge along it, woods, vines and orchards on it or within 100 m, high-voltage lines over it or within 100 m), the territorial food projects covering the commune (food-projects, an empty list when none does), the farming and food of the commune (territory: quality-signs, organic, hve, canteens, schools, as in /links/communes/{insee}.json), the zones delimited for wines under AOC that hold the point (quality-zones, an empty list when none does), the owners that are in the HVE directory (hve-owners, with a member key), zonings including protected areas and public forests, land transactions, the companies and public bodies that own the parcel (owners, with a member key; without a key, owners-preview gives the first two characters of each value and owners-note says members-only; no-legal-person when private persons own it), yields of the department, farms of the commune, and the 30 days before the latest report of the nearest weather station (distance and until). Example uses a point inside Saint-Porchaire (17250).",
      category: t("tools"),
      query: {
        latitude: {
          description:
            "Latitude of the point to identify (WGS84 degrees). Example: 45.8295169339847 (Saint-Porchaire).",
          type: "string",
        },
        longitude: {
          description:
            "Longitude of the point to identify (WGS84 degrees). Example: -0.786978473820221 (Saint-Porchaire).",
          type: "string",
        },
        year: {
          description:
            "CAP code reference year used to resolve the crop label (defaults to the campaign of the declaration).",
          type: "number",
        },
      },
      resourceSchema: {},
      example: examples.parcelIdentifier,
    }),
  },

  "/tools/parcel-identifier.geojson": {
    get: ResourceEndpoint({
      description: t("tools_parcel_identifier") + " (GeoJSON)",
      category: t("tools"),
      query: {
        latitude: {
          description: "Latitude of the point to identify (WGS84 degrees).",
          type: "string",
        },
        longitude: {
          description: "Longitude of the point to identify (WGS84 degrees).",
          type: "string",
        },
        year: {
          description:
            "CAP code reference year used to resolve the crop label (defaults to the campaign of the declaration).",
          type: "number",
        },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/cadastral-parcels.json": {
    get: TableEndpoint({
      description: t("geographical_references_cadastral_parcel_title"),
      category: t("geographical_references_title"),
      query: {
        code: {
          description: "City code",
          type: "string",
        },
        prefix: {
          description: "Cadastre sheet prefix",
          type: "string",
        },
        section: {
          description: "Cadastre sheet section",
          type: "string",
        },
        number: {
          description: "Parcel number",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/cadastral-parcels/{id}.json": {
    get: ResourceEndpoint({
      description: t("geographical_references_cadastral_parcel"),
      category: t("geographical_references_title"),
      params: {
        id: {
          description: "Id of the parcel",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/geographical-references/cadastral-parcels/{id}/geolocation.geojson": {
    get: ResourceEndpoint({
      description: t("documentation_cadastral_parcel_location"),
      category: t("geographical_references_title"),
      params: {
        id: {
          description: "Id of the parcel",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/geographical-references/cap-parcels.json": {
    get: TableEndpoint({
      description:
        t("geographical_references_cap_parcel_title") +
        ". Example query: ?city=Saint-Porchaire (postal 17250).",
      category: t("geographical_references_title"),
      query: {
        city: {
          description:
            "Filters the parcels with the provided city name (case-insensitive ILIKE %city%). Example: Saint-Porchaire.",
          type: "string",
        },
      },
      resourceSchema: {},
      example: examples.capParcels,
    }),
  },

  "/geographical-references/cap-parcels/{cap_id}.json": {
    get: ResourceEndpoint({
      description:
        t("geographical_references_cap_parcel") +
        ". Example: parcel 463509 in Saint-Porchaire.",
      category: t("geographical_references_title"),
      params: {
        cap_id: {
          description: "CAP identifier of the parcel. Example: 463509.",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
      example: examples.capParcel,
    }),
  },

  "/geographical-references/cap-parcels/map.json": {
    get: ResourceEndpoint({
      description:
        "CAP parcels map for a given municipality: per-crop coloring, hectare statistics and a 3D donut breakdown. Example: ?city=Saint-Porchaire.",
      category: t("geographical_references_title"),
      query: {
        city: {
          description:
            "Required. Municipality name; accepts hyphenated/abbreviated spellings (Saint-Porchaire, St-Porchaire, ST PORCHAIRE).",
          type: "string",
        },
        category: {
          description:
            "Optional. Filters the rendered parcels by crop label (ILIKE %category%). Example: Maïs.",
          type: "string",
        },
      },
      resourceSchema: {},
      example: examples.capParcelsMap,
    }),
  },

  "/geographical-references/cap-parcels/map.geojson": {
    get: ResourceEndpoint({
      description:
        "GeoJSON FeatureCollection of the CAP parcels for a given municipality. Each feature carries style (stroke + crop fill) and a popup HTML in its properties. Example: ?city=Saint-Porchaire.",
      category: t("geographical_references_title"),
      query: {
        city: {
          description: "Required municipality name (see /cap-parcels/map.json).",
          type: "string",
        },
        category: {
          description: "Optional crop label filter (see /cap-parcels/map.json).",
          type: "string",
        },
      },
      resourceSchema: {},
      example: examples.capParcelsMapGeo,
      exampleMediaType: "application/geo+json",
    }),
  },

  "/geographical-references/cap-parcels/{cap_id}/geolocation.geojson": {
    get: ResourceEndpoint({
      description: t("documentation_cap_parcel_location"),
      category: t("geographical_references_title"),
      params: {
        cap_id: {
          description: "CAP identifier of the parcel",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/geographical-references/cadastral-parcel-prices.json": {
    get: TableEndpoint({
      description: t("geographical_references_cadastral_parcel_price_title"),
      category: t("geographical_references_title"),
      query: {
        postal_code: {
          description: "Filters transactions by postal code.",
          type: "string",
        },
        city: {
          description: "Searches for a matching city name.",
          type: "string",
        },
        department: {
          description: "Filters transactions by department code.",
          type: "string",
        },
        parcel: {
          description: "Filters transactions for a specific cadastral parcel id.",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/cadastral-parcel-prices/{id}.json": {
    get: ResourceEndpoint({
      description: t("geographical_references_cadastral_parcel_price_title"),
      category: t("geographical_references_title"),
      params: {
        id: {
          description: "Id of the parcel price (transaction) record.",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/geographical-references/food-projects.json": {
    get: TableEndpoint({
      description:
        t("food_project_title") +
        ". The projects recognised by the ministry of agriculture, from the France PAT observatory: holder, recognition level (1 or 2, empty while pending), themes, number of communes, farms and share of organic farmland of the territory, link to the sheet on france-pat.fr. Example query: ?commune=35236 returns the projects covering that commune.",
      category: t("geographical_references_title"),
      query: {
        commune: {
          description: "INSEE code of a commune the project covers. Example: 35236.",
          type: "string",
        },
        name: { description: "Searches for a project whose name holds this text.", type: "string" },
        level: { description: "Recognition level.", type: "string", enum: ["1", "2"] },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/municipalities.json": {
    get: TableEndpoint({
      description:
        t("geographical_references_municipality_title") +
        ". Example query: ?city=Saint-Porchaire returns the entry for postal 17250.",
      category: t("geographical_references_title"),
      query: {
        country: {
          description: "Filters the postal codes by country.",
          type: "string",
          enum: Object.values(Country),
        },
        city: {
          description:
            "Searches for a matching city name. Accepts hyphenated/abbreviated spellings (Saint-Porchaire, St-Porchaire).",
          type: "string",
        },
      },
      resourceSchema: {},
      example: examples.municipalities,
    }),
  },

  "/geographical-references/municipalities/{id}.json": {
    get: ResourceEndpoint({
      description:
        t("geographical_references_municipality") +
        ". Example: Saint-Porchaire (id 17387_17250_STPORC_).",
      category: t("geographical_references_title"),
      params: {
        id: {
          type: "string",
          description: "ID of the municipality. Example: 17387_17250_STPORC_.",
        },
      },
      query: {},
      resourceSchema: {},
      example: examples.municipality,
    }),
  },

  "/geographical-references/municipalities/{id}/cadastre.geojson": {
    get: ResourceEndpoint({
      description: t("documentation_municipality_cadastre"),
      category: t("geographical_references_title"),
      params: {
        id: { type: "string", description: "ID of the municipality" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/geographical-references/municipalities/{id}/cap-parcels.geojson": {
    get: ResourceEndpoint({
      description: t("documentation_municipality_cap"),
      category: t("geographical_references_title"),
      params: {
        id: { type: "string", description: "ID of the municipality" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/production/productions.json": {
    get: TableEndpoint({
      description: t("productions_title"),
      category: t("production_title"),
      query: {
        family: {
          description: "Filters the productions by family of activities.",
          type: "string",
          enum: Object.values(ActivityFamily),
        },
        usage: {
          description: "Filters the productions by usage.",
          type: "string",
          enum: Object.values(ProductionUsage),
        },
      },
      resourceSchema: {},
    }),
  },

  "/production/technical-workflows.json": {
    get: TableEndpoint({
      description: t("production_workflows_title"),
      category: t("production_title"),
      query: {
        production: {
          description: "Reference name of a production. Example: winter_common_wheat.",
          type: "string",
        },
        system: {
          description: "Production system. Example: organic_farming.",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/production/prices.json": {
    get: TableEndpoint({
      description: t("production_prices_title"),
      category: t("production_title"),
      query: {
        department: {
          description: "Filters production prices by department code (zone).",
          type: "string",
        },
        specie: {
          description:
            "Filters production prices by specie reference (e.g. helianthus_annuus).",
          type: "string",
        },
        campaign: {
          description: "Filters production prices by campaign year (e.g. 2024).",
          type: "number",
        },
      },
      resourceSchema: {},
    }),
  },

  "/production/prices/map.json": {
    get: ResourceEndpoint({
      description: t("production_prices_map_title"),
      category: t("production_title"),
      query: {
        specie: {
          description:
            "Specie reference whose aggregated prices should be plotted on the map.",
          type: "string",
        },
        campaign: {
          description: "Restricts the aggregation to the provided campaign year.",
          type: "number",
        },
      },
      resourceSchema: {},
    }),
  },

  "/production/prices/map.geojson": {
    get: ResourceEndpoint({
      description: t("production_prices_map_title"),
      category: t("production_title"),
      query: {
        specie: {
          description:
            "Specie reference whose aggregated prices should be plotted on the map.",
          type: "string",
        },
        campaign: {
          description: "Restricts the aggregation to the provided campaign year.",
          type: "number",
        },
      },
      resourceSchema: {},
    }),
  },

  "/phytosanitary/cropsets.json": {
    get: TableEndpoint({
      description: t("phytosanitary_cropset_title"),
      category: t("phytosanitary_title"),
      query: {},
      resourceSchema: {},
    }),
  },

  "/phytosanitary/products.json": {
    get: TableEndpoint({
      description: t("phytosanitary_product_title"),
      category: t("phytosanitary_title"),
      query: {
        type: {
          description: "Filters the phytosanitary products by the provided type",
          type: "string",
          enum: Object.values(ProductType),
        },
        state: {
          description: "Filters the phytosanitary products by the provided state",
          type: "string",
          enum: Object.values(ProductState),
        },
      },
      resourceSchema: {},
    }),
  },

  "/phytosanitary/usages.json": {
    get: TableEndpoint({
      description:
        t("phytosanitary_usage_title") +
        ". What each product is authorised for: crop, target, dose, days before harvest, untreated buffer from water.",
      category: t("phytosanitary_title"),
      query: {
        crop: {
          description:
            "Crop as E-Phy names it, from its first letters. Example: Blé. Some usages are filed under a group, such as Céréales à paille.",
          type: "string",
        },
        target: {
          description: "Searches for a target holding this text. Example: pucerons.",
          type: "string",
        },
        product: { description: "Authorisation number of a product.", type: "string" },
        state: {
          description: "State of the usage.",
          type: "string",
          enum: ["authorized", "withdrawn"],
        },
      },
      resourceSchema: {},
    }),
  },

  "/phytosanitary/purchases.json": {
    get: TableEndpoint({
      description:
        t("phytosanitary_purchase_title") +
        ". Kilograms of active substance bought, by commune, year, product and substance, over the last five years (BNV-D sales, estimated by the SDES). Purchases, not uses: a quantity is declared at the postal code of the buyer, then shared between its communes in proportion to their farmland outside grassland. Purchases under statistical secrecy are left out.",
      category: t("phytosanitary_title"),
      query: {
        commune: { description: "INSEE code of a commune. Example: 17387.", type: "string" },
        year: { description: "Year of purchase. Example: 2024.", type: "string" },
        substance: {
          description:
            "Exact name of a substance, in lower case without accents. Example: glyphosate. The names are listed by /phytosanitary/substance-purchases.",
          type: "string",
        },
        product: { description: "Authorisation number of a product.", type: "string" },
      },
      resourceSchema: {},
    }),
  },

  "/phytosanitary/commune-purchases.json": {
    get: TableEndpoint({
      description:
        t("phytosanitary_purchase_commune_title") +
        ". One line per commune and year: kilograms of active substance, number of products and substances, and whether some purchases are masked by statistical secrecy (the quantity is empty when all are).",
      category: t("phytosanitary_title"),
      query: {
        commune: { description: "INSEE code of a commune. Example: 17387.", type: "string" },
        year: { description: "Year of purchase. Example: 2024.", type: "string" },
      },
      resourceSchema: {},
    }),
  },

  "/phytosanitary/substance-purchases.json": {
    get: TableEndpoint({
      description:
        t("phytosanitary_purchase_substance_title") +
        ". One line per substance and year: kilograms bought in metropolitan France, number of communes and products, function and hazard class.",
      category: t("phytosanitary_title"),
      query: {
        substance: { description: "Searches for a substance holding this text.", type: "string" },
        year: { description: "Year of purchase. Example: 2024.", type: "string" },
        function: {
          description: "Function of the substance.",
          type: "string",
          enum: ["herbicide", "fungicide", "insecticide", "other"],
        },
      },
      resourceSchema: {},
    }),
  },

  "/phytosanitary/symbols.json": {
    get: TableEndpoint({
      description: t("phytosanitary_symbol_title"),
      category: t("phytosanitary_title"),
      query: {},
      resourceSchema: {},
    }),
  },

  "/seeds/varieties.json": {
    get: TableEndpoint({
      description: t("seeds_variety_title"),
      category: t("seeds_title"),
      query: {
        species: {
          description: "Search for a seed variety with a matching name",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/viticulture/vine-varieties.json": {
    get: TableEndpoint({
      description: t("viticulture_vine_variety_title"),
      category: t("viticulture_title"),
      query: {
        category: {
          description: "Filters the vine varieties by the provided category.",
          type: "string",
          enum: Object.values(VineCategory),
        },
        color: {
          description: "Filters the vine varieties by the provided color.",
          type: "string",
          enum: Object.values(VineColor),
        },
      },
      resourceSchema: {
        $ref: "#/components/schemas/VineVariety",
      },
    }),
  },

  "/weather/stations.json": {
    get: TableEndpoint({
      description: t("weather_station_title"),
      category: t("weather_title"),
      query: {
        country: {
          description: "Filters the weather stations by the provided country.",
          type: "string",
          enum: Object.values(Country),
        },
        name: {
          description: "Searches for weather stations with a matching name.",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/weather/stations/{station_code}.json": {
    get: ResourceEndpoint({
      description: t("weather_station"),
      category: t("weather_title"),
      params: {
        station_code: {
          description: "The identifier code of the weather station.",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/weather/stations/{station_code}/geolocation.geojson": {
    get: ResourceEndpoint({
      description: t("weather_station") + " — " + t("common_location"),
      category: t("weather_title"),
      params: {
        station_code: {
          description: "The identifier code of the weather station.",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/weather/stations/{station_code}/hourly-reports.json": {
    get: TableEndpoint({
      description: t("documentation_weather_hourly_reports"),
      category: t("weather_title"),
      params: {
        station_code: {
          description: "The identifier code of the weather station.",
          type: "string",
        },
      },
      query: {
        start: {
          description: "Returns the reports collected after the provided date.",
          type: "date",
        },
        end: {
          description: "Returns the reports collected before the provided date.",
          type: "date",
        },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/cap-parcels/history.json": {
    get: ResourceEndpoint({
      description:
        t("geographical_references_cap_history_title") +
        ". The crop declared at a point for each campaign of the graphic parcel register, the latest first. 400 without a point.",
      category: t("geographical_references_title"),
      query: {
        longitude: {
          description: "Required. Longitude of the point (WGS84 degrees).",
          type: "number",
        },
        latitude: {
          description: "Required. Latitude of the point (WGS84 degrees).",
          type: "number",
        },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/municipalities/{id}/last-year-weather-reports.json": {
    get: ResourceEndpoint({
      description:
        "Daily weather of the last twelve months at the station nearest to a municipality.",
      category: t("geographical_references_title"),
      params: {
        id: { type: "string", description: "ID of the municipality" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/weather/stations/{station_code}/last-year-temperature-reports.json": {
    get: ResourceEndpoint({
      description: "Daily temperatures of a station over the last twelve months.",
      category: t("weather_title"),
      params: {
        station_code: {
          description: "The identifier code of the weather station.",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/weather/stations/{station_code}/last-year-humidity-reports.json": {
    get: ResourceEndpoint({
      description: "Daily humidity of a station over the last twelve months.",
      category: t("weather_title"),
      params: {
        station_code: {
          description: "The identifier code of the weather station.",
          type: "string",
        },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/enterprises/enterprises.json": {
    get: TableEndpoint({
      description:
        t("enterprises_sirene_title") +
        ". Every establishment of the SIRENE register, whatever its activity.",
      category: t("enterprises_title"),
      query: {
        name: {
          description: "Searches for establishments whose name holds this text.",
          type: "string",
        },
        siren: { description: "Filters by SIREN (9 digits).", type: "string" },
        city: {
          description: "Searches for establishments whose city holds this text.",
          type: "string",
        },
        code: {
          description:
            "Filters by the beginning of the main activity code (APE). Example: 01 for farming.",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/enterprises/enterprises/{siren}.json": {
    get: ResourceEndpoint({
      description: "A company and its establishments.",
      category: t("enterprises_title"),
      params: {
        siren: { description: "SIREN of the company (9 digits).", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/enterprises/rica.json": {
    get: TableEndpoint({
      description: t("enterprises_rica_title"),
      category: t("enterprises_title"),
      query: {
        year: { description: "Filters the holdings by accounting year.", type: "number" },
        ote_64: {
          description: "Filters the holdings by type of farming (OTEX, 64 classes).",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/enterprises/rica/{holding}.json": {
    get: ResourceEndpoint({
      description: "A holding of the RICA sample for one year.",
      category: t("enterprises_title"),
      params: {
        holding: { description: "Identifier of the holding.", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/enterprises/rica/{holding}/variables.json": {
    get: TableEndpoint({
      description: t("enterprises_rica_variables_title"),
      category: t("enterprises_title"),
      params: {
        holding: { description: "Identifier of the holding.", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/tools/trainings.json": {
    get: ResourceEndpoint({
      description:
        t("tools_trainings") +
        " (JSON). Schools of agricultural education and what each prepares for, from RefEA: the nearest to a place first, forty at most. A school is placed in its commune, not at its address: distances are between centres of communes. The answer also lists the diplomas, specialities and routes one can filter by. Example: ?place=17387&diploma=BTSA&route=apprenticeship.",
      category: t("tools"),
      query: {
        place: {
          description: "A commune: INSEE code, postal code or name. Example: 17387.",
          type: "string",
        },
        diploma: { description: "Diploma, as listed in diplomas. Example: BTSA.", type: "string" },
        speciality: {
          description: "Speciality, as listed in specialities. Example: Viticulture.",
          type: "string",
        },
        route: {
          description: "school, apprenticeship, continuing or higher_education.",
          type: "string",
        },
        q: { description: "Words the name of the training holds.", type: "string" },
        boarding: { description: "1 to keep schools with boarding only.", type: "string" },
        school: { description: "Code of one school (id), to read all it prepares for.", type: "string" },
      },
      resourceSchema: {},
    }),
  },

  "/links/communes/{insee}.json": {
    get: ResourceEndpoint({
      description:
        "What Lexicon knows of a commune: postal codes, cadastral parcels, parcels owned by companies, establishments, farming population, nearest weather station. Paris, Lyon and Marseille also exist as whole communes (75056, 69123, 13055), summing their arrondissements. The farming and food of the commune come with it: quality-signs (areas of AOC/AOP, IGP and IG covering it, by family, with their products; for information, the specification of a product alone being official), organic (operators, farms and organic area year by year from the Agence Bio; an area of fewer than three farms is masked, and the intercommunality gives the order of magnitude; parcels are counted at the seat of the farm), hve (number of farms of the HVE directory seated there, a minimum; their names with a member key), canteens (canteens of the national register and what they declared of their purchases: organic share and share under another quality sign, median and weighted by meals; only canteens that declared), agricultural-schools (schools of the commune, or the three nearest).",
      category: t("documentation_links"),
      params: {
        insee: { description: "INSEE code of the commune. Example: 17387.", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/links/enterprises/{siren}.json": {
    get: ResourceEndpoint({
      description:
        "What Lexicon knows of a company: establishments, cadastral parcels it owns, CAP subsidies.",
      category: t("documentation_links"),
      reserved: "members",
      params: {
        siren: { description: "SIREN of the company (9 digits).", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  ...InputPaths(t),

  "/rd-agri/documents.json": {
    get: TableEndpoint({
      description:
        t("rd_agri_documents_title") +
        ". Full-text search (accents ignored); when no document holds every word, any word is enough and 'relaxed' is true. Licence CC BY-NC-SA 4.0.",
      category: t("rd_agri_title"),
      query: {
        q: { description: "Words to search for.", type: "string" },
        production: { description: "Filters by production.", type: "string" },
        taxon: { description: "Filters by taxon.", type: "string" },
        pest: { description: "Filters by pest or disease.", type: "string" },
        "production-system": {
          description: "Filters by production system (organic farming, for instance).",
          type: "string",
        },
        "area-kind": {
          description: "Kind of the area a document is about (to use with area-code).",
          type: "string",
        },
        "area-code": { description: "Code of that area.", type: "string" },
        "year-from": { description: "Documents published this year or after.", type: "number" },
        "year-to": { description: "Documents published this year or before.", type: "number" },
        publisher: { description: "Filters by publisher.", type: "string" },
      },
      resourceSchema: {},
    }),
  },

  "/rd-agri/documents/{id}.json": {
    get: ResourceEndpoint({
      description: "An R&D document: title, summary, authors, publisher, link to the source.",
      category: t("rd_agri_title"),
      params: {
        id: { description: "Identifier of the document (URL-encoded).", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/catalog.json": {
    get: ResourceEndpoint({
      description:
        "The datasets in service: version, date, tables, licence, access. Also as /catalog.csv.",
      category: t("documentation_catalog"),
      query: {},
      resourceSchema: {},
    }),
  },

  "/catalog/{name}.json": {
    get: ResourceEndpoint({
      description: "A dataset in service: its tables, their columns and what links them.",
      category: t("documentation_catalog"),
      params: {
        name: { description: "Name of the dataset. Example: weather.", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/credits/datasources.json": {
    get: TableEndpoint({
      description: t("credits_datasources_title"),
      category: t("credits_title"),
      query: {},
      resourceSchema: {},
    }),
  },

  "/bundles/{flavor}/{file}": {
    get: ResourceEndpoint({
      description:
        "A file of a private bundle (a repository of packages: its index, then each package). Read by './lexicon fetch'.",
      category: t("documentation_catalog"),
      reserved: "bundle:<flavor>",
      params: {
        flavor: { description: "Name of the bundle.", type: "string" },
        file: { description: "Path of the file inside the bundle.", type: "string" },
      },
      query: {},
      resourceSchema: {},
    }),
  },

  "/mcp": {
    post: {
      summary:
        "MCP server (Model Context Protocol, JSON-RPC 2.0 over HTTP) for agents. Tools: list_datasets, describe_dataset, list_resources, read_resource (tables come compact: columns once, one array per row), get_parcel, get_crop_figures, search_phytosanitary_products, get_phytosanitary_purchases, get_commune, get_enterprise, search_rd_documents, get_rd_document, get_crop_history, get_input_price, find_agricultural_trainings. get_commune and get_parcel carry the quality signs, the organic farming, the farms certified HVE, the canteens and the agricultural schools of a commune. A key is only needed for what is reserved.",
      tags: [t("tools")],
      requestBody: {
        content: {
          "application/json": {
            schema: {},
            example: { jsonrpc: "2.0", id: 1, method: "tools/list" },
          },
        },
      },
      responses: { 200: { content: { "application/json": { schema: {} } } } },
    },
  },
})

// One page per table of inputs, filtered on the fields its page filters on
const InputPaths = (t: Translator) =>
  Object.fromEntries(
    (["open", "reserved"] as const).flatMap((access) =>
      INPUT_RESOURCES[access].map((resource) => [
        resource.path + ".json",
        {
          get: TableEndpoint({
            description: t(titleOfInput(resource)),
            category: t("inputs_title"),
            reserved: access === "reserved" ? "members" : undefined,
            query: Object.fromEntries(
              (resource.filters ?? []).map(([field, how]) => [
                field,
                {
                  description:
                    how === "is"
                      ? `Filters on the exact value of ${field}.`
                      : `Searches for a ${field} holding this text.`,
                  type: "string",
                },
              ]),
            ),
            resourceSchema: {},
          }),
        },
      ]),
    ),
  )

export function generateDocumentation(t: Translator, output: OutputFormat) {
  const documentation = {
    info: {
      title: "Lexicon API",
      description:
        "Documentation of Lexicon. Response examples throughout this document use the commune of Saint-Porchaire (postal 17250, INSEE 17387, Charente-Maritime) as a consistent reference point — the same coordinates (45.8295169339847, -0.786978473820221) work for /tools/parcel-identifier. Every page exists as HTML, and as JSON or CSV by adding .json or .csv to its path. Most of the API is open; the endpoints marked as reserved need an API key, sent as 'Authorization: Bearer <key>' or in the 'X-API-Key' header (401 without a key, 403 when the key does not carry the scope, or is used from an address or a site its holder did not allow). A member of OSFarm makes, narrows and revokes their own keys under /account. The data can be read from the pages of other sites (Access-Control-Allow-Origin: *). Without a key, the HTML page of a reserved table shows a preview instead: its first ten rows, with the first two characters of each text and no figure; JSON and CSV stay refused.",
      version: packageJson.version,
    },

    termsOfService: "http://swagger.io/terms/",
    contact: {
      name: "Maintainers",
      url: "http://www.osfarm.org",
      email: "developers@brad.ag",
    },
    license: {
      name: "Apache 2.0",
      url: "http://www.apache.org/licenses/LICENSE-2.0.html",
    },
    openapi: "3.0.0",

    paths: Paths(t),

    components: {
      securitySchemes: {
        Bearer: { type: "http", scheme: "bearer" },
        ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
      schemas: {
        VineVariety: {
          type: "object",
          properties: {
            name: {
              $ref: "#/components/schemas/Text",
            },
            category: {
              $ref: "#/components/schemas/Text",
            },
            color: {
              $ref: "#/components/schemas/Text",
            },
            utilities: {
              type: "object",
              properties: {
                "@type": {
                  type: "string",
                  example: "List",
                },
                label: {
                  type: "string",
                },
                values: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        SelectField: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Select",
            },
            label: {
              type: "string",
              example: "Catégorie",
            },
            options: {
              type: "object",
              additionalProperties: {
                type: "string",
              },
            },
            required: {
              type: "boolean",
              example: false,
            },
          },
        },

        Text: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Text",
            },
            label: {
              type: "string",
            },
            value: {
              type: "string",
            },
            color: {
              type: "string",
            },
          },
        },
        Number: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Number",
            },
            label: {
              type: "string",
            },
            value: {
              type: "number",
            },
            unit: {
              type: "string",
            },
            icon: {
              type: "string",
            },
          },
        },
        Boolean: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Boolean",
            },
            label: {
              type: "string",
            },
            value: {
              type: "boolean",
            },
          },
        },
        Date: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Date",
            },
            label: {
              type: "string",
            },
            value: {
              type: "string",
            },
            iso: {
              type: "string",
            },
          },
        },
        Datum: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Datum",
            },
            label: {
              type: "string",
            },
            value: {
              type: "number",
            },
            unit: {
              type: "string",
            },
            timestamp: {
              type: "number",
            },
            interpretation: {
              type: "string",
            },
            icon: {
              type: "string",
            },
            color: {
              type: "string",
            },
          },
        },
        Image: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Image",
            },
            label: {
              type: "string",
            },
            href: {
              type: "string",
            },
            alt: {
              type: "string",
            },
            width: {
              type: "number",
            },
            height: {
              type: "number",
            },
          },
        },
        Link: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Link",
            },
            label: {
              type: "string",
            },
            value: {
              type: "string",
            },
            method: {
              type: "string",
              example: "GET",
              enum: ["GET", "POST"],
            },
            href: {
              type: "string",
            },
            icon: {
              type: "string",
            },
            color: {
              type: "string",
            },
            payload: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
        List: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "List",
            },
            label: {
              type: "string",
            },
            values: {
              type: "array",
              items: {},
            },
          },
        },
        Map: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Map",
            },
            label: {
              type: "string",
            },
            icon: {
              type: "string",
            },
            values: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
        Undefined: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Undefined",
            },
            label: {
              type: "string",
            },
            value: {
              type: "string",
            },
            icon: {
              type: "string",
            },
          },
        },
      },
    },
  }

  const page = {
    "@id": "",
    title: t("documentation_title"),
    breadcrumbs: [
      Hypermedia.Link({
        value: t("home_title"),
        method: "GET",
        href: "/",
      }),
    ],
    documentation,
  }

  return match(output)
    .returnType<unknown>()
    .case({
      json: () =>
        new Response(JSON.stringify(page), {
          headers: { "Content-Type": "application/json" },
        }),
      _otherwise: () => Documentation(page),
    })
}

type EndpointDoc = {
  description: string
  category: string
  // Scope a key must carry, when the endpoint is not open
  reserved?: string
  params?: Record<string, { type: string; description: string }>
  query: Record<
    string,
    {
      type: string
      description: string
      enum?: unknown[]
      default?: unknown
      minimum?: number
    }
  >
  resourceSchema: object
  example?: object
  exampleMediaType?: string
}

function ResourceEndpoint(doc: EndpointDoc) {
  const pathParameters = Object.entries(doc.params || {}).map(([field, schema]) => ({
    name: field,
    in: "path",
    description: schema.description,
    required: true,
    schema: { type: schema.type },
  }))

  const queryParameters = Object.entries(doc.query).map(([field, schema]) => ({
    name: field,
    in: "query",
    description: schema.description,
    required: false,
    schema: { type: schema.type, enum: schema.enum },
  }))

  const mediaType = doc.exampleMediaType ?? "application/json"
  const content: Record<string, { schema: object; example?: object }> = {
    "application/json": { schema: doc.resourceSchema },
  }
  if (doc.example) {
    content[mediaType] = { schema: doc.resourceSchema, example: doc.example }
  }

  return {
    summary:
      doc.description +
      (doc.reserved ? ` Reserved: needs an API key carrying '${doc.reserved}'.` : ""),
    tags: [doc.category],
    ...(doc.reserved ? { security: [{ Bearer: [] }, { ApiKey: [] }] } : {}),
    produces: [
      "text/html",
      "application/json",
      "text/csv",
      "application/geo+json",
    ],
    parameters: [...pathParameters, ...queryParameters],
    responses: {
      200: {
        content,
      },
    },
  }
}

function TableEndpoint(doc: EndpointDoc) {
  const pageParameter = {
    description: "The number of the page you wish to consult.",
    required: false,
    type: "number",
    default: 1,
    minimum: 1,
  }

  return ResourceEndpoint({
    description: doc.description,
    category: doc.category,
    reserved: doc.reserved,
    params: doc.params,
    query: { page: pageParameter, ...doc.query },
    resourceSchema: doc.resourceSchema,
    example: doc.example,
    exampleMediaType: doc.exampleMediaType,
  })
}
