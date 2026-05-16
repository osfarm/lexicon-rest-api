import { Html } from "@elysiajs/html"
import type { Geometry } from "../../types/Geometry"
import type { Coordinates } from "../../types/Coordinates"

interface Props {
  center: Coordinates
  markers: Coordinates[]
  shapes: Geometry[]
  zoom?: number
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

  const shapes = props.shapes
    .map(
      (shape) =>
        `L.geoJSON(${JSON.stringify(
          shape
        )}, {onEachFeature: onEachFeature, style: styleFeature}).addTo(map${uniqid})`
    )
    .join(";")

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
        ${shapes}  

       

    </script>
      `}
    </>
  )
}
