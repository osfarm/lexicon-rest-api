import {
  ParcelIdentifier,
  type ParcelIdentifierOkPage,
} from "../templates/pages/ParcelIdentifier"
import { Field } from "../templates/components/Form"
import { coordinatesToPoint } from "../types/Geometry"
import { ParcelTable } from "./GeographicalReferences/CadastralParcel"
import { CapParcelTable } from "./GeographicalReferences/CapParcel"
import { MunicipalityTable } from "./GeographicalReferences/Municipality"
import { Concurrently, match, None, Ok, Some, type AsyncResult } from "shulk"
import { Hypermedia, hypermedia2json } from "../Hypermedia"
import { isNumber } from "../utils"
import type { Translator } from "../Translator"
import { AutoList } from "../templates/views/AutoList"
import { API } from "../API"

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("tools"),
    method: "GET",
    href: "/tools",
  }),
]

export const Tools = API.new()
  .path("/tools", (cxt) =>
    AutoList({
      t: cxt.t,
      page: {
        title: cxt.t("tools"),
        breadcrumbs: [Breadcrumbs(cxt.t)[0]],
        links: [
          Hypermedia.Link({
            value: cxt.t("tools_parcel_identifier"),
            method: "GET",
            href: "/tools/parcel-identifier",
          }),
        ],
      },
    }),
  )
  .path("/tools/parcel-identifier", async (cxt) => {
    const title = cxt.t("tools_parcel_identifier")

    const breadcrumbs = Breadcrumbs(cxt.t)

    const form = {
      latitude: Field.Number({
        label: cxt.t("common_fields_latitude"),
        required: true,
        unit: "°",
        defaultValue: cxt.query.latitude ? parseFloat(cxt.query.latitude) : undefined,
      }),
      longitude: Field.Number({
        label: cxt.t("common_fields_longitude"),
        required: true,
        unit: "°",
        defaultValue: cxt.query.longitude ? parseFloat(cxt.query.longitude) : undefined,
      }),
    }

    const maybeCoordinates =
      cxt.query && cxt.query.latitude && cxt.query.longitude
        ? Some({
            latitude: parseFloat(cxt.query.latitude),
            longitude: parseFloat(cxt.query.longitude),
          })
        : None()

    const maybePoint = maybeCoordinates.map(coordinatesToPoint)

    const page = await match(maybePoint)
      .returnType<AsyncResult<Error, ParcelIdentifierOkPage>>()
      .case({
        None: async () => Ok({ title, breadcrumbs, form }),
        Some: async ({ val: point }) => {
          const searchMunicipalityQuery = MunicipalityTable(cxt.db)
            .select()
            .where("city_shape", "ST_CONTAINS", point)
            .limit(1)

          const searchCadastralParcelQuery = ParcelTable(cxt.db)
            .select()
            .where("shape", "ST_CONTAINS", point)
            .limit(1)

          const searchCAPParcelQuery = CapParcelTable(cxt.db)
            .select()
            .where("shape", "ST_CONTAINS", point)
            .limit(1)

          // prettier-ignore
          const queriesResult = await Concurrently
          .run(() => searchMunicipalityQuery.run())
          .and(() => searchCadastralParcelQuery.run())
          .and(() => searchCAPParcelQuery.run())
          .done()

          return queriesResult
            .map(([municipalities, cadastralParcels, capParcels]) => ({
              municipality: municipalities[0] || undefined,
              cadastralParcel: cadastralParcels[0] || undefined,
              capParcel: capParcels[0] || undefined,
            }))
            .map(({ municipality, cadastralParcel, capParcel }) => ({
              title,
              breadcrumbs,
              form,
              information: municipality
                ? {
                    country: Hypermedia.Text({
                      label: cxt.t("common_fields_country"),
                      value: cxt.t("country_" + municipality.country),
                    }),
                    city: Hypermedia.Link({
                      label: cxt.t("geographical_references_municipality_city"),
                      value: municipality.city_name,
                      method: "GET",
                      href: "/geographical-references/municipalities/" + municipality.id,
                    }),
                    "city-code": Hypermedia.Text({
                      label: cxt.t("geographical_references_municipality_city_code"),
                      value: municipality.code,
                    }),
                    "postal-code": Hypermedia.Text({
                      label: cxt.t("geographical_references_municipality_postal_code"),
                      value: municipality.postal_code,
                    }),
                  }
                : undefined,
              cadastre: cadastralParcel
                ? {
                    id: Hypermedia.Link({
                      label: cxt.t("geographical_references_cadastral_parcel_id"),
                      value: cadastralParcel.id,
                      method: "GET",
                      href:
                        "/geographical-references/cadastral-parcels/" +
                        cadastralParcel.id,
                    }),
                    prefix: Hypermedia.Text({
                      label: cxt.t(
                        "geographical_references_cadastral_parcel_section_prefix",
                      ),
                      value: cadastralParcel.section_prefix,
                    }),
                    section: Hypermedia.Text({
                      label: cxt.t("geographical_references_cadastral_parcel_section"),
                      value: cadastralParcel.section,
                    }),
                    number: Hypermedia.Text({
                      label: cxt.t(
                        "geographical_references_cadastral_parcel_work_number",
                      ),
                      value: cadastralParcel.work_number,
                    }),
                    area: Hypermedia.Number({
                      label: cxt.t("geographical_references_cadastral_parcel_area"),
                      value: cadastralParcel.net_surface_area,
                      unit: "m²",
                    }),
                  }
                : undefined,
              cap: capParcel
                ? {
                    id: Hypermedia.Link({
                      label: cxt.t("geographical_references_cap_parcel_id"),
                      value: capParcel.id,
                      method: "GET",
                      href: "/geographical-references/cap-parcels/" + capParcel.id,
                    }),
                    "crop-code": Hypermedia.Text({
                      label: cxt.t("geographical_references_cap_parcel_crop_code"),
                      value: capParcel.cap_crop_code,
                    }),
                    culture: Hypermedia.Text({
                      label: cxt.t("geographical_references_cap_parcel_culture"),
                      value: capParcel.cap_label,
                    }),
                  }
                : undefined,
              geolocation: cadastralParcel?.shape
                ? {
                    coordinates: maybeCoordinates.unwrapOr({
                      latitude: 0,
                      longitude: 0,
                    }),
                    marker: point,
                    shape: cadastralParcel.shape,
                  }
                : undefined,
            }))
        },
      })

    return match(cxt.output)
      .returnType<unknown>()
      .case({
        json: () => hypermedia2json(cxt.request, page.val),
        geojson: () => page.map((page) => page.geolocation?.shape).unwrapOr(undefined),
        html: () => ParcelIdentifier({ page, t: cxt.t }),
        _otherwise: () => "Format not supported",
      })
  })
