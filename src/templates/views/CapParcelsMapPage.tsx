import { Html } from "@elysiajs/html"
import { Layout } from "../layouts/Layout"
import { Form, type FormDefinition } from "../components/Form"
import { Map, type MapLayer } from "../components/Map"
import { DonutChart3D } from "../components/DonutChart3D"
import type { HypermediaType } from "../../Hypermedia"
import type { Coordinates } from "../../types/Coordinates"
import type { Translator } from "../../Translator"

export interface CapParcelsMapStats {
  totalParcels: number
  totalHectares: number
  averageParcelHectares: number
  cropCount: number
  hectaresByCrop: { crop: string; hectares: number; color: string }[]
}

interface Props {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  t: Translator
  form: FormDefinition
  submitLabel: string
  message?: string
  stats?: CapParcelsMapStats
  map?: {
    center: Coordinates
    layers: MapLayer[]
    zoom?: number
  }
}

export function CapParcelsMapPage(props: Props) {
  const t = props.t

  return (
    <Layout title={props.title} breadcrumbs={props.breadcrumbs} t={t}>
      <Form method="GET" definition={props.form} submitLabel={props.submitLabel} />

      {props.message ? (
        <p>
          <i>{props.message}</i>
        </p>
      ) : (
        ""
      )}

      {props.map ? (
        <Map
          center={props.map.center}
          markers={[]}
          shapes={[]}
          layers={props.map.layers}
          zoom={props.map.zoom}
        />
      ) : (
        ""
      )}

      {props.stats ? <StatsSection stats={props.stats} t={t} /> : ""}
    </Layout>
  )
}

function StatsSection(props: { stats: CapParcelsMapStats; t: Translator }) {
  const { stats, t } = props

  const formatHa = (ha: number) =>
    ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 })

  const donutSegments = stats.hectaresByCrop.map((row) => ({
    label: row.crop,
    value: row.hectares,
    color: row.color,
  }))

  return (
    <div style={{ marginTop: "20px" }}>
      <h3>{t("geographical_references_cap_parcel_map_stats_title")}</h3>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "20px",
          marginBottom: "15px",
        }}
      >
        <StatBox
          label={t("geographical_references_cap_parcel_map_total_parcels")}
          value={stats.totalParcels.toLocaleString("fr-FR")}
        />
        <StatBox
          label={t("geographical_references_cap_parcel_map_total_area")}
          value={formatHa(stats.totalHectares) + " ha"}
        />
        <StatBox
          label={t("geographical_references_cap_parcel_map_average_parcel_size")}
          value={formatHa(stats.averageParcelHectares) + " ha"}
        />
        <StatBox
          label={t("geographical_references_cap_parcel_map_crop_count")}
          value={stats.cropCount.toLocaleString("fr-FR")}
        />
      </div>

      {donutSegments.length > 0 ? (
        <>
          <h4>{t("geographical_references_cap_parcel_map_hectares_per_crop")}</h4>
          <DonutChart3D
            segments={donutSegments}
            unit="ha"
            legendTitle={t("geographical_references_cap_parcel_map_donut_select")}
          />
        </>
      ) : (
        ""
      )}
    </div>
  )
}

function StatBox(props: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 15px",
        borderRadius: "8px",
        backgroundColor: "hsla(0, 0%, 100%, 0.1)",
        minWidth: "150px",
      }}
    >
      <div style={{ fontSize: "0.85em", opacity: 0.75 }}>{props.label}</div>
      <div style={{ fontSize: "1.5em", fontWeight: "bold", marginTop: "3px" }}>
        {props.value}
      </div>
    </div>
  )
}
