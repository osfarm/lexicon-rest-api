import { Html } from "@elysiajs/html"
import { Layout } from "../layouts/Layout"
import { Form, type FormDefinition } from "../components/Form"
import { Map } from "../components/Map"
import type { HypermediaType } from "../../Hypermedia"
import type { Geometry } from "../../types/Geometry"
import type { Coordinates } from "../../types/Coordinates"
import type { Translator } from "../../Translator"

interface LegendItem {
  label: string
  color: string
}

interface Props {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  t: Translator
  form: FormDefinition
  submitLabel: string
  message?: string
  legendTitle?: string
  legend?: LegendItem[]
  map?: {
    center: Coordinates
    shapes: Geometry[]
    zoom?: number
  }
}

export function ProductionPricesMapPage(props: Props) {
  return (
    <Layout title={props.title} breadcrumbs={props.breadcrumbs} t={props.t}>
      <Form method="GET" definition={props.form} submitLabel={props.submitLabel} />

      {props.message ? (
        <p>
          <i>{props.message}</i>
        </p>
      ) : (
        ""
      )}

      {props.map ? (
        <Map center={props.map.center} markers={[]} shapes={props.map.shapes} zoom={props.map.zoom} />
      ) : (
        ""
      )}

      {props.legend && props.legend.length > 0 ? (
        <div style={{ marginTop: "15px" }}>
          {props.legendTitle ? <strong>{props.legendTitle}</strong> : ""}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
            {props.legend.map((item) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "16px",
                    height: "16px",
                    backgroundColor: item.color,
                    border: "1px solid #444",
                  }}
                ></span>
                {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        ""
      )}
    </Layout>
  )
}
