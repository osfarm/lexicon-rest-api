import { Html } from "@elysiajs/html"
import { Layout } from "../layouts/Layout"
import type { HypermediaType } from "../../Hypermedia"
import type { Geometry } from "../../types/Geometry"
import { Map } from "./../components/Map"

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
      <Map {...props.map} />
    </Layout>
  )
}
