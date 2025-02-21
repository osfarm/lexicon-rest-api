import { Html } from "@elysiajs/html"
import type { Translator } from "../../Translator"
import { Layout } from "../layouts/Layout"
import { Field, Form, type FormDefinition } from "../components/Form"
import { match, type Result } from "shulk"
import { Error } from "../components/Error"
import type { Hypermedia, HypermediaType } from "../../Hypermedia"
import { Map } from "../components/Map"
import type { Coordinates } from "../../types/Coordinates"
import type { MultiPolygon } from "../../types/Geometry"

export interface ParcelIdentifierOkPage {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form: FormDefinition
  information?: Record<string, Hypermedia>
  cadastre?: Record<string, Hypermedia>
  cap?: Record<string, Hypermedia>
  geolocation?: {
    coordinates: Coordinates
    shape: MultiPolygon
  }
}

interface Props {
  t: Translator
  page: Result<Error, ParcelIdentifierOkPage>
}

export function ParcelIdentifier(props: Props) {
  const { page, t } = props

  return match(page).case({
    Err: ({ val: error }) => <Error error={error} />,
    Ok: ({ val }) => (
      <Layout title={val.title} breadcrumbs={val.breadcrumbs} t={t}>
        <Form definition={val.form} method="GET" />

        {renderSection(t("tools_parcel_identifier_information"), val.information)}

        {renderSection(t("tools_parcel_identifier_cadastre"), val.cadastre)}

        {renderSection(t("tools_parcel_identifier_cap"), val.cap)}

        {val.geolocation && (
          <>
            <h2>{t("common_location")}</h2>

            <Map
              center={val.geolocation.coordinates}
              markers={[val.geolocation.coordinates]}
              shapes={[val.geolocation.shape]}
            />
          </>
        )}
      </Layout>
    ),
  })
}

function renderSection(title: string, section?: Record<string, Hypermedia>) {
  if (!section) {
    return
  } else {
    return (
      <div>
        <h2>{title}</h2>

        {Object.values(section)
          .map((h) => (
            <span>
              <b>{h.label}</b> {renderHypermedia(h)}
            </span>
          ))
          .join("<br />")}
      </div>
    )
  }
}

function renderHypermedia(element: Hypermedia) {
  return match(element).case({
    Text: (h) => h.value,
    Number: (h) => h.value + " " + h.unit,
    Link: (h) => `<a href="${h.href}">${h.value}</a>`,
    _otherwise: () => "Unknown",
  })
}
