import packageJson from "../../package.json"
import { Hypermedia } from "../Hypermedia"
import { Documentation } from "../templates/Documentation"
import type { Translator } from "../Translator"

export function generateDocumentation(t: Translator) {
  const documentation = {
    info: {
      title: "Lexicon",
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

    paths: {
      "/phytosanitary/cropsets.json": {
        get: TableEndpoint({
          description: "Lists cropsets.",
          category: "phytosanitary",
          query: {},
          resourceSchema: {},
        }),
      },

      "/phytosanitary/products.json": {
        get: TableEndpoint({
          description: "Lists phytosanitary products.",
          category: "phytosanitary",
          query: {
            type: {
              description:
                "Filters the phytosanitary products by the provided type",
              type: "string",
            },
            state: {
              description:
                "Filters the phytosanitary products by the provided state",
              type: "string",
            },
          },
          resourceSchema: {},
        }),
      },

      "/phytosanitary/symbols.json": {
        get: TableEndpoint({
          description: "Lists phytosanitary symbols.",
          category: "phytosanitary",
          query: {},
          resourceSchema: {},
        }),
      },

      "/viticulture/vine-varieties.json": {
        get: TableEndpoint({
          description: "Lists vine varieties.",
          category: "viticulture",
          query: {
            category: {
              description:
                "Filters the vine varieties by the provided category.",
              type: "string",
            },
            color: {
              description: "Filters the vine varieties by the provided color.",
              type: "string",
            },
          },
          resourceSchema: {
            $ref: "#/components/schemas/VineVariety",
          },
        }),
      },

      "/weather/stations.json": {
        get: TableEndpoint({
          description: "Lists available weather stations.",
          category: "weather",
          query: {
            country: {
              description:
                "Filters the weather stations by the provided country.",
              type: "string",
            },
            name: {
              description:
                "Searches for weather stations with a matching name.",
              type: "string",
            },
          },
          resourceSchema: {},
        }),
      },

      "/weather/stations/{station_code}/hourly-reports.json": {
        get: TableEndpoint({
          description:
            "Retrieves the hourly weather reports for a given weather station.",
          category: "weather",
          params: {
            station_code: {
              description: "The identifier code of the weather station.",
              type: "string",
            },
          },
          query: {
            start: {
              description:
                "Returns the reports collected after the provided date.",
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
    },

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
                  example: "Usages",
                },
                values: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Text",
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

  return Documentation(page)
}

type EndpointDoc = {
  description: string
  category: string
  params?: Record<string, { type: string; description: string }>
  query: Record<string, { type: string; description: string }>
  resourceSchema: object
}

function TableEndpoint(doc: EndpointDoc) {
  return {
    summary: doc.description,
    description: doc.description,
    tags: [doc.category],
    produces: ["text/html", "application/json", "text/csv"],
    parameters: [
      ...Object.entries(doc.params || {}).map(([field, schema]) => ({
        name: field,
        in: "path",
        description: schema.description,
        required: true,
        schema: { type: schema.type },
      })),
      {
        name: "page",
        in: "query",
        description: "The number of the page you wish to consult.",
        required: false,
        schema: {
          type: "number",
          default: 1,
          minimum: 1,
        },
      },
      ...Object.entries(doc.query).map(([field, schema]) => ({
        name: field,
        in: "query",
        description: schema.description,
        required: false,
        schema: { type: schema.type },
      })),
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                "@id": {
                  type: "string",
                },
                title: {
                  type: "string",
                },
                breadcrumbs: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Link",
                  },
                },
                form: {
                  type: "object",
                  properties: {},
                },
                table: {
                  type: "object",
                  properties: {
                    columns: {
                      type: "object",
                      properties: {},
                    },
                    rows: {
                      type: "array",
                      items: doc.resourceSchema,
                    },
                  },
                },
                credit: {
                  type: "object",
                  properties: {
                    provider: {
                      $ref: "#/components/schemas/Text",
                    },
                    website: {
                      $ref: "#/components/schemas/Link",
                    },
                    date: {
                      $ref: "#/components/schemas/Date",
                    },
                    license: {
                      $ref: "#/components/schemas/Link",
                    },
                  },
                },
                "items-per-page": {
                  type: "integer",
                  example: 150,
                },
                "items-count": {
                  type: "integer",
                  example: 150,
                },
                "items-total": {
                  type: "integer",
                  example: 416,
                },
                page: {
                  type: "integer",
                  example: 1,
                },
                "total-pages": {
                  type: "integer",
                  example: 3,
                },
                pages: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Link",
                  },
                },
                navigation: {
                  type: "object",
                  properties: {
                    "next-page": {
                      $ref: "#/components/schemas/Link",
                    },
                    "last-page": {
                      $ref: "#/components/schemas/Link",
                    },
                  },
                },
                formats: {
                  type: "object",
                  properties: {
                    html: {
                      $ref: "#/components/schemas/Link",
                    },
                    json: {
                      $ref: "#/components/schemas/Link",
                    },
                    csv: {
                      $ref: "#/components/schemas/Link",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}
