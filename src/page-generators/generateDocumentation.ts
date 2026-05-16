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

const Paths = (t: Translator) => ({
  "/tools/parcel-identifier.json": {
    get: ResourceEndpoint({
      description: t("tools_parcel_identifier") + " (JSON)",
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
            "CAP code reference year used to resolve the crop label (defaults to the latest supported year).",
          type: "number",
        },
      },
      resourceSchema: {},
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
            "CAP code reference year used to resolve the crop label (defaults to the latest supported year).",
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
      description: t("geographical_references_cap_parcel_title"),
      category: t("geographical_references_title"),
      query: {
        city: {
          description: "Filters the parcels with the provided city name",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/cap-parcels/{cap_id}.json": {
    get: ResourceEndpoint({
      description: t("geographical_references_cap_parcel"),
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

  "/geographical-references/municipalities.json": {
    get: TableEndpoint({
      description: t("geographical_references_municipality_title"),
      category: t("geographical_references_title"),
      query: {
        country: {
          description: "Filters the postal codes by country.",
          type: "string",
          enum: Object.values(Country),
        },
        city: {
          description: "Searches for a matching city name.",
          type: "string",
        },
      },
      resourceSchema: {},
    }),
  },

  "/geographical-references/municipalities/{id}.json": {
    get: ResourceEndpoint({
      description: t("geographical_references_municipality"),
      category: t("geographical_references_title"),
      params: {
        id: { type: "string", description: "ID of the municipality" },
      },
      query: {},
      resourceSchema: {},
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
})

export function generateDocumentation(t: Translator, output: OutputFormat) {
  const documentation = {
    info: {
      title: "Lexicon API",
      description: "Documentation of Lexicon.",
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
      json: () => page,
      _otherwise: () => Documentation(page),
    })
}

type EndpointDoc = {
  description: string
  category: string
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

  return {
    summary: doc.description,
    tags: [doc.category],
    produces: [
      "text/html",
      "application/json",
      "text/csv",
      "application/geo+json",
    ],
    parameters: [...pathParameters, ...queryParameters],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: doc.resourceSchema,
          },
        },
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
    params: doc.params,
    query: { page: pageParameter, ...doc.query },
    resourceSchema: doc.resourceSchema,
  })
}
