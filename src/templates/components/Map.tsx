import { Html } from "@elysiajs/html"
import type { Feature, Geometry } from "../../types/Geometry"
import type { Coordinates } from "../../types/Coordinates"

type MapShape = Geometry | Feature

export interface MapLayer {
  name: string
  color: string
  shapes: MapShape[]
}

interface Props {
  center: Coordinates
  markers: Coordinates[]
  shapes: MapShape[]
  layers?: MapLayer[]
  zoom?: number
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function Map(props: Props) {
  const uniqid = Date.now()
  const zoom = props.zoom ?? 13

  const markers = props.markers
    .map(
      (marker) =>
        `L.marker([${marker.latitude}, ${marker.longitude}]).addTo(map${uniqid});`
    )
    .join(";")

  const flatShapes = !props.layers
    ? props.shapes
        .map(
          (shape) =>
            `L.geoJSON(${JSON.stringify(
              shape
            )}, {onEachFeature: onEachFeature, style: styleFeature}).addTo(map${uniqid})`
        )
        .join(";")
    : ""

  const layerScripts = props.layers
    ? props.layers
        .map((layer, idx) => {
          const features = layer.shapes
            .map(
              (shape) =>
                `L.geoJSON(${JSON.stringify(
                  shape
                )}, {onEachFeature: onEachFeature, style: styleFeature})`
            )
            .join(",\n")
          return `var layer_${uniqid}_${idx} = L.featureGroup([${features}]).addTo(map${uniqid});`
        })
        .join("\n")
    : ""

  const overlaysObject = props.layers
    ? "{" +
      props.layers
        .map((layer, idx) => {
          const label = `<span style="display:inline-block;width:12px;height:12px;background-color:${layer.color};border:1px solid #444;margin-right:6px;vertical-align:middle"></span>${escapeHtmlAttr(layer.name)}`
          return `${JSON.stringify(label)}: layer_${uniqid}_${idx}`
        })
        .join(", ") +
      "}"
    : ""

  const layersControl = props.layers
    ? `L.control.layers(null, ${overlaysObject}, { collapsed: true, position: 'topright' }).addTo(map${uniqid});`
    : ""

  return (
    <>
      <div id={"map-" + uniqid} style={{ height: "600px" }}></div>

      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin=""
      />
      <script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""
      ></script>

      {`
      <script>
        function onEachFeature(feature, layer) {
            if (feature.properties && feature.properties.html) {
                layer.bindPopup(feature.properties.html);
            }
        }

        function styleFeature(feature) {
            if (feature.properties && feature.properties.style) {
                return feature.properties.style;
            }
            return {};
        }

        var map${uniqid} = L.map('map-${uniqid}').setView([${props.center.latitude}, ${props.center.longitude}], ${zoom});
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map${uniqid});


        ${markers}
        ${flatShapes}
        ${layerScripts}
        ${layersControl}



    </script>
      `}
    </>
  )
}
