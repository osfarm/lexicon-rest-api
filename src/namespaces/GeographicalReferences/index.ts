import Elysia, { t } from "elysia"
import { Hypermedia } from "../../Hypermedia"
import { AutoList } from "../../templates/views/AutoList"
import type { Translator } from "../../Translator"
import type { Context } from "../../types/Context"
import { MunicipalityAPI } from "./MunicipalityAPI"
import { CadastralParcelAPI } from "./CadastralParcelAPI"
import { CapParcelAPI } from "./CapParcelAPI"

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

export const GeographicalReferences = new Elysia({
  prefix: "/geographical-references",
})
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("geographical_references_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("geographical_references_cadastral_parcel_title"),
            method: "GET",
            href: "/geographical-references/cadastral-parcels",
          }),
          Hypermedia.Link({
            value: t("geographical_references_cap_parcel_title"),
            method: "GET",
            href: "/geographical-references/cap-parcels",
          }),
          Hypermedia.Link({
            value: t("geographical_references_municipality_title"),
            method: "GET",
            href: "/geographical-references/municipalities",
          }),
        ],
      },
      t,
    })
  )
  .use(MunicipalityAPI)
  .use(CadastralParcelAPI)
  .use(CapParcelAPI)
