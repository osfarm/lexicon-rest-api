import { Hypermedia } from "../../Hypermedia"
import type { Translator } from "../../Translator"
import { AutoList } from "../../templates/views/AutoList"
import { API } from "../../API"
import { ParcelIdentifierController } from "./ParcelIdentifierController"

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
  .path("/tools/parcel-identifier", (cxt) =>
    ParcelIdentifierController(cxt, Breadcrumbs(cxt.t)),
  )
