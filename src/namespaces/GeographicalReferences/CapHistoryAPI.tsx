import { Html } from "@elysiajs/html"
import { API } from "../../API"
import {
  coordinatesOf,
  cropHistoryAt,
  type CropOfCampaign,
} from "../../cap-history/CapHistory"
import { Hypermedia } from "../../Hypermedia"
import { Layout } from "../../templates/layouts/Layout"
import type { Context } from "../../types/Context"

const e = (value: unknown) => Html.escapeHtml(String(value ?? ""))

const PATH = "/geographical-references/cap-parcels/history"

const refusal = (status: number, message: string) =>
  Response.json({ error: { status, message } }, { status })

const breadcrumbs = (cxt: Context) => [
  Hypermedia.Link({ value: cxt.t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({
    value: cxt.t("geographical_references_title"),
    method: "GET",
    href: "/geographical-references",
  }),
  Hypermedia.Link({
    value: cxt.t("geographical_references_cap_parcel_title"),
    method: "GET",
    href: "/geographical-references/cap-parcels",
  }),
]

function Page(props: { cxt: Context; crops?: CropOfCampaign[] }) {
  const { cxt, crops } = props

  return (
    <Layout
      title={cxt.t("geographical_references_cap_history_title")}
      breadcrumbs={breadcrumbs(cxt)}
      t={cxt.t}
    >
      <p>{cxt.t("geographical_references_cap_history_help")}</p>
      <form method="get" action={PATH}>
        {(["longitude", "latitude"] as const).map((name) => (
          <label style={{ display: "inline-block", marginRight: "10px" }}>
            {cxt.t("common_fields_" + name)}
            <br />
            <input
              class="field"
              name={name}
              value={e(cxt.query[name] ?? "")}
              style={{ width: "150px" }}
              required
            />
          </label>
        ))}
        <button class="button primary" type="submit">
          {cxt.t("common_see")}
        </button>
      </form>

      {crops === undefined ? (
        ""
      ) : crops.length === 0 ? (
        <p>{cxt.t("geographical_references_cap_history_none")}</p>
      ) : (
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              {[
                "geographical_references_cap_history_campaign",
                "geographical_references_cap_parcel_culture",
                "geographical_references_cap_parcel_crop_code",
                "geographical_references_cap_parcel_id",
              ].map((key) => (
                <th style={{ textAlign: "left" }}>{cxt.t(key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {crops.map((crop) => (
              <tr>
                <td>{crop.campaign}</td>
                <td>{e(crop.crop ?? "—")}</td>
                <td>{e(crop["crop-code"] ?? "—")}</td>
                <td>
                  {crop.current ? (
                    <a
                      href={`/geographical-references/cap-parcels/${e(crop["parcel-id"])}`}
                    >
                      {e(crop["parcel-id"])}
                    </a>
                  ) : (
                    e(crop["parcel-id"])
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  )
}

async function history(cxt: Context) {
  const point = coordinatesOf(cxt.query)

  if (point === undefined) {
    return cxt.output === "json"
      ? refusal(400, "A point is needed: longitude and latitude, in degrees (WGS 84)")
      : Page({ cxt })
  }

  const crops = await cropHistoryAt(cxt.db, point)

  if (crops === undefined) {
    return refusal(404, "The CAP parcels are not in service")
  }

  return cxt.output === "json"
    ? Response.json({ ...point, campaigns: crops })
    : Page({ cxt, crops })
}

export const CapHistoryAPI = API.new().path(PATH, history)
