import { Hypermedia } from "../../Hypermedia"
import { generateTablePage } from "../../page-generators/generateTablePage"
import type { Context } from "../../types/Context"
import { Field } from "../../templates/components/Form"
import { CapParcelTable } from "./CapParcel"
import { MunicipalityTable } from "./Municipality"
import { MunicipalityFilters } from "./MunicipalityFilters"
import type { Translator } from "../../Translator"
import { generateResourcePage } from "../../page-generators/generateResourcePage"
import { pointToCoordinates } from "../../types/Coordinates"
import { generateMapSection } from "../../page-generators/generateMapSection"
import {
  CapParcelsMapPage,
  type CapParcelsMapStats,
} from "../../templates/views/CapParcelsMapPage"
import type { MapLayer } from "../../templates/components/Map"
import {
  checkUndefined,
  normalizeCitySearchCandidates,
} from "../../utils"
import { resolveCapCodeColors } from "../../CropColors"

const CAP_CODE_YEAR = 2025
const PARCEL_STROKE_COLOR = "#1565C0"
import { API } from "../../API"

const MAX_MAP_PARCELS = 5000

const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("geographical_references_title"),
    method: "GET",
    href: "/geographical-references",
  }),
]

export const CapParcelAPI = API.new()
  .path("/geographical-references/cap-parcels", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("geographical_references_cap_parcel_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      form: {
        city: Field.Text({
          label: cxt.t("common_fields_city"),
          required: false,
        }),
        //   culture: Field.Text({
        //     label: cxt.t("geographical_references_cap_parcel_culture"),
        //     required: false,
        //   }),
      },
      formHandler: (input, query) => {
        if (input.city) {
          query.where("city_name", "ILIKE", `%${input.city}%`)
        }
        if (input.culture) {
          query.where("cap_label", "ILIKE", `%${input.culture}%`)
        }
      },
      query: CapParcelTable(cxt.db)
        .select("id", "cap_crop_code", "city_name", "cap_label")
        .orderBy("city_name", "ASC"),
      columns: {
        city: cxt.t("common_fields_city"),
        id: cxt.t("ID"),
        culture: cxt.t("geographical_references_cap_parcel_culture"),
        details: cxt.t("common_details"),
      },
      handler: (parcel) => ({
        city: Hypermedia.Text({
          label: cxt.t("common_fields_city"),
          value: parcel.city_name,
        }),
        id: Hypermedia.Text({
          label: cxt.t("ID"),
          value: parcel.id,
        }),
        culture: Hypermedia.Text({
          label: cxt.t("geographical_references_cap_parcel_culture"),
          value: parcel.cap_label,
        }),
        details: Hypermedia.Link({
          label: cxt.t("common_details"),
          value: cxt.t("common_see"),
          method: "GET",
          href: "/geographical-references/cap-parcels/" + parcel.id,
        }),
      }),
    }),
  )
  .path("/geographical-references/cap-parcels/:id", (cxt: Context) =>
    generateResourcePage(cxt, {
      breadcrumbs: [
        ...Breadcrumbs(cxt.t),
        Hypermedia.Link({
          value: cxt.t("geographical_references_cap_parcel_title"),
          method: "GET",
          href: "/geographical-references/cap-parcels",
        }),
      ],
      handler: async (id) => {
        const readCapParcelResult = await CapParcelTable(cxt.db).read(id)

        return readCapParcelResult.map((parcel) => ({
          title: parcel.id,
          details: {
            id: Hypermedia.Text({
              label: cxt.t("geographical_references_cap_parcel_id"),
              value: parcel.id,
            }),
            "crop-code": Hypermedia.Text({
              label: cxt.t("geographical_references_cap_parcel_crop_code"),
              value: parcel.cap_crop_code,
            }),
            city: Hypermedia.Text({
              label: cxt.t("common_fields_city"),
              value: parcel.city_name,
            }),
            culture: Hypermedia.Text({
              label: cxt.t("geographical_references_cap_parcel_culture"),
              value: parcel.cap_label,
            }),
          },
          sections: {
            geolocation: Hypermedia.Link({
              value: cxt.t("common_location"),
              method: "GET",
              href: `/geographical-references/cap-parcels/${id}/geolocation`,
            }),
          },
          links: [],
        }))
      },
    }),
  )
  .path("/geographical-references/cap-parcels/map", async (cxt: Context) => {
    const city = cxt.query.city
    const category = cxt.query.category

    const form = {
      city: Field.Text({
        label: cxt.t("common_fields_city"),
        required: true,
        defaultValue: city,
      }),
      category: Field.Text({
        label: cxt.t("geographical_references_cap_parcel_map_category"),
        required: false,
        defaultValue: category,
      }),
    }

    const breadcrumbs = [
      ...Breadcrumbs(cxt.t),
      Hypermedia.Link({
        value: cxt.t("geographical_references_cap_parcel_title"),
        method: "GET",
        href: "/geographical-references/cap-parcels",
      }),
      Hypermedia.Link({
        value: cxt.t("geographical_references_cap_parcel_map_title"),
        method: "GET",
        href: "/geographical-references/cap-parcels/map",
      }),
    ]

    const title = cxt.t("geographical_references_cap_parcel_map_title")

    const renderMessage = (message: string) =>
      cxt.output === "json" || cxt.output === "geojson"
        ? new Response(JSON.stringify({ "@id": cxt.request.url, message }), {
            status: 400,
            headers: {
              "Content-Type":
                cxt.output === "geojson" ? "application/geo+json" : "application/json",
            },
          })
        : cxt.output === "csv"
        ? new Response("", { status: 400, headers: { "Content-Type": "text/csv" } })
        : CapParcelsMapPage({
            title,
            breadcrumbs,
            t: cxt.t,
            form,
            submitLabel: cxt.t("filter"),
            message,
          })

    if (!city) {
      return renderMessage(cxt.t("geographical_references_cap_parcel_map_help"))
    }

    const findMunicipality = async () => {
      for (const candidate of normalizeCitySearchCandidates(city)) {
        const res = await MunicipalityTable(cxt.db)
          .select()
          .where("city_name", "LIKE", `%${candidate}%`)
          .limit(1)
          .run()
        const filtered = res
          .map((rows) => rows[0])
          .flatMap(checkUndefined)
          .flatMap(MunicipalityFilters.hasGeolocation)
        if (filtered._state === "Ok") {
          return filtered.val
        }
      }
      return undefined
    }

    const municipality = await findMunicipality()

    if (!municipality) {
      return renderMessage(cxt.t("geographical_references_cap_parcel_map_city_not_found"))
    }

    const parcelsQuery = CapParcelTable(cxt.db)
      .select(
        "id",
        "cap_crop_code",
        "shape",
        "cap_label",
        "cap_category",
        "postgis.ST_Area(shape::postgis.geography) AS area_m2" as any,
      )
      .where("shape", "ST_WITHIN", municipality.city_shape)
      .limit(MAX_MAP_PARCELS)

    if (category) {
      parcelsQuery.where("cap_label", "LIKE", `%${category}%`)
    }

    const parcelsResult = await parcelsQuery.run()

    if (parcelsResult._state === "Err") {
      return renderMessage(parcelsResult.val.message)
    }

    const rawParcels = parcelsResult.val as Array<
      (typeof parcelsResult.val)[number] & { area_m2: string | number | null }
    >

    // master_crop_production_cap_codes PK is (cap_code, production, year);
    // the cap_code-only oneToOne join multiplies each parcel by year/production.
    const seenIds = new Set<string>()
    const parcels = rawParcels.filter((p) => {
      if (seenIds.has(p.id)) return false
      seenIds.add(p.id)
      return true
    })

    const categoryKey = (p: typeof parcels[number]) =>
      p.cap_label ?? p.cap_crop_code

    const distinctCapCodes = Array.from(
      new Set(parcels.map((p) => p.cap_crop_code).filter(Boolean)),
    )
    const capCodeColors = await resolveCapCodeColors(
      cxt.db,
      distinctCapCodes,
      CAP_CODE_YEAR,
    )

    const seeLabel = cxt.t("common_see")
    const hectaresLabel = cxt.t("geographical_references_cap_parcel_map_hectares")

    const buildFeature = (parcel: typeof parcels[number]) => {
      const fill = capCodeColors.get(parcel.cap_crop_code) ?? "#999999"
      const hectares = (Number(parcel.area_m2) || 0) / 10000
      return {
        type: "Feature" as const,
        geometry: parcel.shape,
        properties: {
          style: {
            color: PARCEL_STROKE_COLOR,
            fillColor: fill,
            fillOpacity: 0.65,
            weight: 1.5,
          },
          href: `/geographical-references/cap-parcels/${parcel.id}`,
          html: `<b>${parcel.cap_label ?? parcel.cap_crop_code}</b><br/>
              ${hectares.toFixed(2)} ${hectaresLabel}<br/>
              <a href="/geographical-references/cap-parcels/${parcel.id}">${seeLabel}</a>
              `,
        },
      }
    }

    const layersMap = new Map<string, { color: string; shapes: any[]; hectares: number }>()
    for (const parcel of parcels) {
      const cat = categoryKey(parcel)
      let entry = layersMap.get(cat)
      if (!entry) {
        entry = {
          color: capCodeColors.get(parcel.cap_crop_code) ?? "#999999",
          shapes: [],
          hectares: 0,
        }
        layersMap.set(cat, entry)
      }
      entry.shapes.push(buildFeature(parcel))
      entry.hectares += (Number(parcel.area_m2) || 0) / 10000
    }

    const layers: MapLayer[] = Array.from(layersMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, entry]) => ({ name, color: entry.color, shapes: entry.shapes }))

    const hectaresByCrop = Array.from(layersMap.entries())
      .map(([crop, entry]) => ({
        crop,
        hectares: Number(entry.hectares.toFixed(2)),
        color: entry.color,
      }))
      .sort((a, b) => b.hectares - a.hectares)

    const totalHectares = hectaresByCrop.reduce((sum, r) => sum + r.hectares, 0)
    const averageParcelHectares =
      parcels.length > 0 ? totalHectares / parcels.length : 0

    const stats: CapParcelsMapStats = {
      totalParcels: parcels.length,
      totalHectares: Number(totalHectares.toFixed(2)),
      averageParcelHectares: Number(averageParcelHectares.toFixed(2)),
      cropCount: layersMap.size,
      hectaresByCrop,
    }

    const center = pointToCoordinates(municipality.city_centroid)
    const truncated = parcels.length >= MAX_MAP_PARCELS

    if (cxt.output === "geojson") {
      const featureCollection = generateMapSection({
        output: cxt.output,
        center,
        markers: [],
        shapes: layers.flatMap((l) => l.shapes),
      })
      return new Response(JSON.stringify(featureCollection), {
        headers: { "Content-Type": "application/geo+json" },
      })
    }

    if (cxt.output === "json") {
      return new Response(
        JSON.stringify({
          "@id": cxt.request.url,
          city: municipality.city_name,
          category: category ?? null,
          truncated,
          stats,
          parcels: parcels.map((p) => ({
            id: p.id,
            cap_crop_code: p.cap_crop_code,
            cap_label: p.cap_label,
            cap_category: p.cap_category,
            area_ha: (Number(p.area_m2) || 0) / 10000,
          })),
        }),
        { headers: { "Content-Type": "application/json" } },
      )
    }

    if (cxt.output === "csv") {
      const header = "id,cap_crop_code,cap_label,cap_category,area_ha"
      const lines = parcels.map((p) =>
        [
          p.id,
          p.cap_crop_code,
          `"${p.cap_label ?? ""}"`,
          `"${p.cap_category ?? ""}"`,
          ((Number(p.area_m2) || 0) / 10000).toFixed(4),
        ].join(","),
      )
      return new Response([header, ...lines].join("\n"), {
        headers: { "Content-Type": "text/csv" },
      })
    }

    return CapParcelsMapPage({
      title: title + " — " + municipality.city_name,
      breadcrumbs,
      t: cxt.t,
      form,
      submitLabel: cxt.t("filter"),
      message: truncated
        ? cxt.t("geographical_references_cap_parcel_map_truncated")
        : parcels.length === 0
        ? cxt.t("geographical_references_cap_parcel_map_no_parcels")
        : undefined,
      stats: parcels.length > 0 ? stats : undefined,
      map:
        parcels.length > 0
          ? {
              center,
              layers,
              zoom: 13,
            }
          : undefined,
    })
  })
  .path("/geographical-references/cap-parcels/:id/geolocation", async (cxt: Context) => {
    const readParcelResult = await CapParcelTable(cxt.db).read(cxt.params.id)

    return readParcelResult
      .map((parcel) => ({
        center: pointToCoordinates(parcel.centroid),
        shapes: [parcel.shape],
      }))
      .map(({ center, shapes }) =>
        generateMapSection({ output: cxt.output, center, markers: [center], shapes }),
      ).val
  })
