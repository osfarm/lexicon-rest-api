import { Html } from "@elysiajs/html"
import { Layout } from "./Layout"
import type { HypermediaType } from "../Hypermedia"
import type { Geometry } from "../types/Geometry"

type Coordinates = {
  latitude: number
  longitude: number
}

interface Props {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  map: {
    center: Coordinates
    markers: Coordinates[]
    shapes: Geometry[]
  }
}

export function MapPage(props: Props) {
  return (
    <Layout title={props.title} breadcrumbs={props.breadcrumbs} t={() => ""}>
      <div id="map" style={{ height: "600px" }}></div>

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
        var map = L.map('map').setView([${props.map.center.latitude}, ${
        props.map.center.longitude
      }], 13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        L.marker([${props.map.markers[0].latitude}, ${props.map.markers[0].longitude}]).addTo(map);
     
     L.geoJSON(${JSON.stringify(props.map.shapes[0])}, {}).addTo(map)
        </script>
      `}
    </Layout>
  )
}
