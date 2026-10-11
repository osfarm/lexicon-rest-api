// The picture of the home page: the datasets of Lexicon as columns, the keys
// they share as threads. The structure is written here by hand, checked
// against the schema: a knot is only drawn where a dataset really has the key.
// The figures come from the catalogue.

export type Text = Readonly<{ fr: string; en: string }>

export type Family = "places" | "farms" | "territory" | "crops" | "environment"

export type WeaveDataset = Readonly<{
  // Name of the datasource in the catalogue
  name: string
  label: Text
  family: Family
  source: string
  // Where its data is browsed
  href: string
}>

export type WeaveKey = Readonly<{
  id: string
  label: Text
  definition: Text
  carriedBy: readonly string[]
}>

export type WeaveStep = Readonly<{
  text: Text
  link: Readonly<{ label: Text; href: string }>
  datasets: readonly string[]
  keys: readonly string[]
}>

export const FAMILIES: Readonly<Record<Family, Text>> = {
  places: { fr: "Lieux", en: "Places" },
  farms: { fr: "Exploitations", en: "Farms" },
  territory: { fr: "Territoire et alimentation", en: "Territory and food" },
  crops: { fr: "Cultures", en: "Crops" },
  environment: { fr: "Milieu", en: "Climate" },
}

export const DATASETS: readonly WeaveDataset[] = [
  {
    name: "postal_codes",
    label: { fr: "Com\u00admunes", en: "Com\u00admunes" },
    family: "places",
    source: "La Poste",
    href: "/geographical-references/municipalities",
  },
  {
    name: "cadastre",
    label: { fr: "Ca\u00addastre", en: "Ca\u00addastre" },
    family: "places",
    source: "Etalab",
    href: "/geographical-references/cadastral-parcels",
  },
  {
    name: "cadastral_prices",
    label: { fr: "Prix fonciers", en: "Land prices" },
    family: "places",
    source: "Etalab",
    href: "/geographical-references/cadastral-parcel-prices",
  },
  {
    name: "graphic_parcels",
    label: { fr: "Parcelles PAC", en: "CAP parcels" },
    family: "places",
    source: "IGN, ASP",
    href: "/geographical-references/cap-parcels",
  },
  {
    name: "cadastre_owners",
    label: { fr: "Proprié\u00adtaires", en: "Owners" },
    family: "farms",
    source: "DGFiP",
    href: "/catalog/cadastre_owners",
  },
  {
    name: "enterprises",
    label: { fr: "Entre\u00adprises", en: "Companies" },
    family: "farms",
    source: "INSEE",
    href: "/enterprises/enterprises",
  },
  {
    name: "cap_beneficiaries",
    label: { fr: "Aides PAC", en: "CAP subsidies" },
    family: "farms",
    source: "ASP",
    href: "/catalog/cap_beneficiaries",
  },
  {
    name: "hve_farms",
    label: { fr: "Exploi\u00adtations HVE", en: "HVE farms" },
    family: "farms",
    source: "Min. Agriculture",
    href: "/catalog/hve_farms",
  },
  {
    name: "msa_populations",
    label: { fr: "Popu\u00adlation agricole", en: "Farming popu\u00adlation" },
    family: "farms",
    source: "MSA",
    href: "/catalog/msa_populations",
  },
  {
    name: "quality_and_origin_signs",
    label: { fr: "Signes de qualité", en: "Quality signs" },
    family: "territory",
    source: "INAO",
    href: "/catalog/quality_and_origin_signs",
  },
  {
    name: "organic_farming",
    label: { fr: "Agri\u00adculture bio", en: "Organic farming" },
    family: "territory",
    source: "Agence Bio",
    href: "/catalog/organic_farming",
  },
  {
    name: "canteens",
    label: { fr: "Can\u00adtines", en: "Can\u00adteens" },
    family: "territory",
    source: "ma cantine",
    href: "/catalog/canteens",
  },
  {
    name: "pat",
    label: { fr: "Projets alimen\u00adtaires", en: "Food projects" },
    family: "territory",
    source: "France PAT",
    href: "/geographical-references/food-projects",
  },
  {
    name: "agricultural_schools",
    label: { fr: "Ensei\u00adgnement agricole", en: "Farming schools" },
    family: "territory",
    source: "RefEA",
    href: "/tools/trainings",
  },
  {
    name: "productions",
    label: { fr: "Produc\u00adtions", en: "Produc\u00adtions" },
    family: "crops",
    source: "Ekylibre",
    href: "/production",
  },
  {
    name: "phytosanitary",
    label: { fr: "Phyto\u00adsanitaire", en: "Plant protection" },
    family: "crops",
    source: "ANSES",
    href: "/phytosanitary",
  },
  {
    name: "phytosanitary_purchases",
    label: { fr: "Achats de phyto\u00adsanitaires", en: "Purchases of plant protection" },
    family: "crops",
    source: "SDES",
    href: "/phytosanitary/purchases",
  },
  {
    name: "rd_agri",
    label: { fr: "Docu\u00adments de R&D", en: "R&D docu\u00adments" },
    family: "crops",
    source: "ACTA",
    href: "/rd-agri/documents",
  },
  {
    name: "weather",
    label: { fr: "Météo", en: "Weather" },
    family: "environment",
    source: "Météo-France",
    href: "/weather",
  },
]

export const KEYS: readonly WeaveKey[] = [
  {
    id: "place",
    label: { fr: "le lieu", en: "the place" },
    definition: {
      fr: "Une forme ou un point sur la carte. Deux jeux qui décrivent le même endroit se rejoignent par lui, sans identifiant commun : c'est ainsi qu'une parcelle du cadastre retrouve la culture déclarée à la PAC.",
      en: "A shape or a point on the map. Two datasets describing the same spot meet through it, with no shared identifier: this is how a cadastral parcel finds the crop declared to the CAP.",
    },
    carriedBy: [
      "postal_codes",
      "cadastre",
      "cadastral_prices",
      "graphic_parcels",
      "enterprises",
      "quality_and_origin_signs",
      "weather",
    ],
  },
  {
    id: "commune",
    label: { fr: "la commune", en: "the commune" },
    definition: {
      fr: "Le code INSEE de la commune, à cinq caractères.",
      en: "The five-character INSEE code of the commune.",
    },
    carriedBy: [
      "postal_codes",
      "cadastre",
      "enterprises",
      "cap_beneficiaries",
      "hve_farms",
      "msa_populations",
      "quality_and_origin_signs",
      "organic_farming",
      "canteens",
      "pat",
      "agricultural_schools",
      "phytosanitary_purchases",
    ],
  },
  {
    id: "cadastral_parcel",
    label: { fr: "la parcelle cadastrale", en: "the cadastral parcel" },
    definition: {
      fr: "L'identifiant d'une parcelle au cadastre : commune, section et numéro.",
      en: "The identifier of a parcel in the cadastre: commune, section and number.",
    },
    carriedBy: ["cadastre", "cadastral_prices", "cadastre_owners"],
  },
  {
    id: "siren",
    label: { fr: "le SIREN", en: "the SIREN" },
    definition: {
      fr: "Le numéro à neuf chiffres d'une entreprise.",
      en: "The nine-digit number of a company.",
    },
    carriedBy: ["cadastre_owners", "enterprises", "cap_beneficiaries", "hve_farms"],
  },
  {
    id: "food_project",
    label: { fr: "le projet alimentaire", en: "the food project" },
    definition: {
      fr: "L'identifiant d'un projet alimentaire territorial (PAT) : chaque cantine porte celui des projets qui la couvrent.",
      en: "The identifier of a territorial food project (PAT): each canteen carries that of the projects covering it.",
    },
    carriedBy: ["canteens", "pat"],
  },
  {
    id: "cap_crop_code",
    label: { fr: "le code culture", en: "the crop code" },
    definition: {
      fr: "Le code de trois lettres d'une culture dans les déclarations de la PAC, comme BTH pour le blé tendre d'hiver.",
      en: "The three-letter code of a crop in CAP declarations, such as BTH for winter soft wheat.",
    },
    carriedBy: ["graphic_parcels", "productions"],
  },
  {
    id: "production",
    label: { fr: "la production", en: "the production" },
    definition: {
      fr: "Une production agricole du référentiel, végétale ou animale.",
      en: "A plant or animal production of the reference list.",
    },
    carriedBy: ["productions", "rd_agri"],
  },
  {
    id: "amm",
    label: { fr: "l'autorisation du produit", en: "the product authorisation" },
    definition: {
      fr: "Le numéro d'autorisation de mise sur le marché (AMM) d'un produit phytosanitaire : il relie un produit autorisé aux quantités achetées dans chaque commune.",
      en: "The marketing authorisation number (AMM) of a plant protection product: it ties an authorised product to the quantities bought in each commune.",
    },
    carriedBy: ["phytosanitary", "phytosanitary_purchases"],
  },
  {
    id: "pest",
    label: { fr: "le bioagresseur", en: "the pest" },
    definition: {
      fr: "Un ravageur ou une maladie, tel que le nomment les autorisations de produits phytosanitaires.",
      en: "A pest or a disease, as named by the authorisations of plant protection products.",
    },
    carriedBy: ["phytosanitary", "rd_agri"],
  },
  {
    id: "weather_station",
    label: { fr: "la station météo", en: "the weather station" },
    definition: {
      fr: "L'identifiant d'une station ; la fiche de chaque commune désigne la plus proche.",
      en: "The identifier of a station; the record of each commune names the nearest one.",
    },
    carriedBy: ["postal_codes", "weather"],
  },
]

export const JOURNEY: readonly WeaveStep[] = [
  {
    text: {
      fr: "Un point sur la carte tombe dans une parcelle du cadastre.",
      en: "A point on the map falls in a parcel of the cadastre.",
    },
    link: {
      label: { fr: "Identifier une parcelle", en: "Identify a parcel" },
      href: "/tools/parcel-identifier",
    },
    datasets: ["cadastre"],
    keys: ["place"],
  },
  {
    text: {
      fr: "Au même endroit, les déclarations de la PAC donnent la culture, campagne après campagne.",
      en: "At the same spot, CAP declarations give the crop, campaign after campaign.",
    },
    link: {
      label: { fr: "Cultures déclarées en un point", en: "Crops declared at a point" },
      href: "/geographical-references/cap-parcels/history",
    },
    datasets: ["cadastre", "graphic_parcels"],
    keys: ["place"],
  },
  {
    text: {
      fr: "La parcelle est dans une commune : ses établissements, ses aides, ses chefs d'exploitation, ses signes de qualité, son agriculture bio, ses cantines.",
      en: "The parcel is in a commune: its establishments, their subsidies, its farm chiefs, its quality signs, its organic farming, its canteens.",
    },
    link: {
      label: { fr: "Fiche d'une commune", en: "Record of a commune" },
      href: "/links/communes/17387",
    },
    datasets: [
      "cadastre",
      "postal_codes",
      "enterprises",
      "cap_beneficiaries",
      "msa_populations",
      "hve_farms",
      "quality_and_origin_signs",
      "organic_farming",
      "canteens",
      "pat",
    ],
    keys: ["commune", "siren"],
  },
  {
    text: {
      fr: "La culture renvoie à sa production, puis aux travaux de recherche qui en parlent.",
      en: "The crop leads to its production, then to the research that deals with it.",
    },
    link: {
      label: { fr: "Docu\u00adments de R&D", en: "R&D docu\u00adments" },
      href: "/rd-agri/documents",
    },
    datasets: ["graphic_parcels", "productions", "rd_agri"],
    keys: ["cap_crop_code", "production"],
  },
]

export type Figures = Readonly<{ rows: number; reserved: boolean }>

/**
 * What the catalogue says of the datasets of the picture. A dataset the
 * catalogue does not know is simply shown without figures.
 */
export function figuresOf(
  catalog: readonly { name: string; rows: number; scope: string }[] | undefined,
): Map<string, Figures> {
  const known = new Set(DATASETS.map((dataset) => dataset.name))

  return new Map(
    (catalog ?? [])
      .filter((dataset) => known.has(dataset.name))
      .map((dataset) => [
        dataset.name,
        { rows: dataset.rows, reserved: dataset.scope !== "open" },
      ]),
  )
}

/**
 * A count a reader takes in at a glance: 93 M, 1,3 M, 49 k.
 */
export function roundedCount(rows: number, language: string): string {
  const format = (value: number, digits: number) =>
    new Intl.NumberFormat(language === "en" ? "en-US" : "fr-FR", {
      maximumFractionDigits: digits,
    }).format(value)

  if (rows >= 1e6) {
    return `${format(rows / 1e6, rows >= 1e7 ? 0 : 1)} M`
  }
  if (rows >= 1e3) {
    return `${format(rows / 1e3, 0)} k`
  }

  return format(rows, 0)
}

/**
 * Where the thread of a key runs: from the first dataset that carries it to
 * the last, through those in between.
 */
export function threadOf(key: WeaveKey): { first: number; last: number } {
  const positions = DATASETS.map((dataset, index) =>
    key.carriedBy.includes(dataset.name) ? index : -1,
  ).filter((index) => index >= 0)

  return { first: Math.min(...positions), last: Math.max(...positions) }
}
