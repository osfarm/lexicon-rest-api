import { match } from "shulk"
import packageJson from "../../package.json"
import { Hypermedia, hypermedia2json } from "../Hypermedia"
import { ProductState, ProductType } from "../namespaces/Phytosanitary"
import { VineCategory, VineColor } from "../namespaces/Viticulture"
import { Documentation } from "../templates/Documentation"
import type { Translator } from "../Translator"
import { Country } from "../types/Country"
import type { OutputFormat } from "../utils"
import { ActivityFamily, ProductionUsage } from "../namespaces/Production"

const Paths = (t: Translator) => ({
  "/geographical-references/postal-codes.json": {
    get: TableEndpoint({
      description: t("geographical_references_postal_code_title"),
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
          description:
            "Filters the phytosanitary products by the provided type",
          type: "string",
          enum: Object.values(ProductType),
        },
        state: {
          description:
            "Filters the phytosanitary products by the provided state",
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
          description:
            "Returns the reports collected before the provided date.",
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
          },
        },
        Link: {
          type: "object",
          properties: {
            "@type": {
              type: "string",
              example: "Link",
            },
            value: {
              type: "string",
            },
            method: {
              type: "string",
              example: "GET",
            },
            href: {
              type: "string",
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
  query: Record<string, { type: string; description: string; enum?: unknown[] }>
  resourceSchema: object
}

function TableEndpoint(doc: EndpointDoc) {
  const pathParameters = Object.entries(doc.params || {}).map(
    ([field, schema]) => ({
      name: field,
      in: "path",
      description: schema.description,
      required: true,
      schema: { type: schema.type },
    })
  )

  const queryParameters = Object.entries(doc.query).map(([field, schema]) => ({
    name: field,
    in: "query",
    description: schema.description,
    required: false,
    schema: { type: schema.type, enum: schema.enum },
  }))

  const pageParameter = {
    name: "page",
    in: "query",
    description: "The number of the page you wish to consult.",
    required: false,
    schema: {
      type: "number",
      default: 1,
      minimum: 1,
    },
  }

  return {
    summary: doc.description,
    tags: [doc.category],
    produces: ["text/html", "application/json", "text/csv"],
    parameters: [...pathParameters, pageParameter, ...queryParameters],
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
