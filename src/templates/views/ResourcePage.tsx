import { Html } from "@elysiajs/html"
import { Layout } from "../layouts/Layout"
import { match, type Result } from "shulk"
import type { Hypermedia, HypermediaType } from "../../Hypermedia"
import { Error } from "../components/Error"
import type { Context } from "../../types/Context"

interface Props {
  page: Result<
    Error,
    {
      title: string
      breadcrumbs: HypermediaType["Link"][]
      details: Record<string, Hypermedia | undefined>
      sections: Record<string, HypermediaType["Link"] | undefined>
      links: HypermediaType["Link"][]
    }
  >
  context: Context
}

export function ResourcePage(props: Props) {
  const { page, context } = props

  return match(page).case({
    Err: ({ val: error }) => <Error error={error} />,
    Ok: ({ val }) => (
      <Layout title={val.title} breadcrumbs={val.breadcrumbs} t={context.t}>
        <div>
          <h2>{context.t("common_details")}</h2>

          {Object.values(val.details)
            .filter((detail) => detail !== undefined)
            .map(
              (detail) =>
                `<b>${detail.label}</b> ${renderHypermedia(
                  detail,
                  context.numberFormatter,
                )}`,
            )
            .join("<br/>")}
        </div>

        <div>
          {Object.entries(val.sections)
            .filter(([, section]) => section !== undefined)
            .map(([key, section]) => (
              <div x-data="{ open: false }">
                <h2
                  hx-get={section?.href}
                  hx-trigger="click once"
                  hx-target={"#" + key + "-tab"}
                  x-on:click="open = !open"
                  style={{ cursor: "pointer" }}
                >
                  <img
                    x-bind:src={
                      "open ? '/public/icons/chevron-down.svg' : '/public/icons/chevron-right.svg'"
                    }
                    height={16}
                  />{" "}
                  {section?.value}
                </h2>
                <div id={key + "-tab"} x-show="open" style={{ display: "none" }}>
                  <div
                    style={{
                      marginLeft: "auto",
                      marginRight: "auto",
                      textAlign: "center",
                    }}
                  >
                    {" "}
                    <img src="/public/icons/spinner.svg" height={32} class="spinner" />
                  </div>
                </div>
              </div>
            ))}
        </div>

        {val.links.length > 0 && (
          <div>
            <h2>{context.t("common_see_also")}</h2>

            <ul>
              {val.links.map((link) => (
                <li>
                  <a href={link.href}>{link.value}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Layout>
    ),
  })
}

function renderHypermedia(
  element: Hypermedia,
  numberFormatter: Context["numberFormatter"],
) {
  return match(element).case({
    Text: (h) => h.value,
    Number: (h) => numberFormatter(h.value) + " " + h.unit,
    Link: (h) => `<a href="${h.href}">${h.value}</a>`,
    Date: (h) => h.value,
    _otherwise: () => "Unknown",
  })
}
