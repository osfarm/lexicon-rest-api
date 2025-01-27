import { html, Html } from "@elysiajs/html"
import type { HypermediaType } from "../Hypermedia"
import { Layout } from "./Layout"
import { isObject, match, type Result } from "shulk"
import type { Translator } from "../Translator"
import { Error } from "./components/Error"
import { Form, type FieldType } from "./components/Form"
import { Card } from "./components/Card"

export interface AutoTableOkInput {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form?: Record<string, FieldType["any"]>
  table: {
    columns: Record<string, string>
    rows: Record<string, HypermediaType["any"] | undefined>[]
  }
  credit?: {
    provider: HypermediaType["Text"]
    website: HypermediaType["Link"]
    date: HypermediaType["Text"]
    license?: HypermediaType["Link"]
  }
  page: number
  "items-per-page": number
  "items-count": number
  "items-total": number
  "total-pages": number
  pages: HypermediaType["Link"][]
  navigation: {
    "first-page": HypermediaType["Link"] | undefined
    "previous-page": HypermediaType["Link"] | undefined
    "next-page": HypermediaType["Link"] | undefined
    "last-page": HypermediaType["Link"] | undefined
  }
  formats: Record<string, HypermediaType["Link"]>
}

interface PageData {
  page: Result<
    {
      title: string
      breadcrumbs: HypermediaType["Link"][]
      form?: Record<string, FieldType["any"]>
      error: Error
    },
    AutoTableOkInput
  >
  t: Translator
}

export function AutoTable(props: PageData) {
  const { page, t } = props

  return match(page).case({
    Err: ({ val: page }) => (
      <Layout title={page.title} breadcrumbs={page.breadcrumbs}>
        {page.form && <Form method={"GET"} definition={page.form} />}

        <br />

        <Error error={page.error} />
      </Layout>
    ),
    Ok: ({ val: page }) => (
      <Layout title={page.title} breadcrumbs={page.breadcrumbs}>
        {page.form && <Form method={"GET"} definition={page.form} />}

        <br />

        <table>
          <thead>
            <tr>
              {Object.values(page.table.columns).map((field) => (
                <th>{field}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {page.table.rows.map((item) => (
              <tr>
                {Object.keys(page.table.columns).map((field) => (
                  <td>
                    {item[field] === undefined ? (
                      <i>{props.t("common_undefined")}</i>
                    ) : (
                      parseHypermedia(item[field])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <br />

        <div style={{ textAlign: "center" }}>
          {page.navigation["previous-page"] ? (
            <a href={page.navigation["previous-page"].href} class="button">
              {"< " + page.navigation["previous-page"].value}
            </a>
          ) : undefined}

          {page.navigation["first-page"] &&
            parseInt(page.navigation["first-page"].value) < page.page - 5 && (
              <>
                <a href={page.navigation["first-page"].href}>
                  {page.navigation["first-page"].value}
                </a>
                {" ... "}
              </>
            )}

          {page.pages
            .map((link) =>
              parseInt(link.value) == page.page ? (
                <a>{link.value}</a>
              ) : (
                <a href={link.href}>{link.value}</a>
              )
            )
            .join(" • ")}

          {page.navigation["last-page"] &&
            parseInt(page.navigation["last-page"].value) > page.page + 5 && (
              <>
                {" "}
                {" ... "}
                <a href={page.navigation["last-page"].href}>
                  {page.navigation["last-page"].value}
                </a>
              </>
            )}

          {page.navigation["next-page"] ? (
            <a href={page.navigation["next-page"].href} class="button">
              {page.navigation["next-page"].value + " >"}
            </a>
          ) : undefined}
        </div>

        <footer style={{ textAlign: "center", marginTop: "25px" }}>
          {Object.values(page.formats)
            .filter((format) => format.value !== "HTML")
            .map((format) => <a href={format.href}>{format.value}</a>)
            .join(" • ")}
        </footer>

        <br />

        {page.credit && (
          <Card info>
            <h3>
              <img src={"/public/icons/circle-info.svg"} height={16} />{" "}
              {page.credit.provider.value}
            </h3>
            <p>
              <img src={page.credit.website.icon} height={16} />{" "}
              <a href={page.credit.website.href} target="_blank">
                {page.credit.website.value}
              </a>{" "}
            </p>
            <p>
              <img src={"/public/icons/calendar.svg"} height={16} />{" "}
              {page.credit.date.value}
            </p>
            {page.credit.license && (
              <p>
                <img src={page.credit.license.icon} height={16} />{" "}
                <a href={page.credit.license.href} target="_blank">
                  {page.credit.license.value}
                </a>
              </p>
            )}
          </Card>
        )}
      </Layout>
    ),
  })
}

const parseHypermedia = (item: HypermediaType["any"]) =>
  match(item)
    .returnType<string | number | boolean | JSX.Element>()
    .case({
      Number: (nb) => <>{nb.value + " " + nb.unit}</>,
      Link: (link) => <a href={link.href}>{link.value}</a>,
      List: (item) =>
        item.values
          .map((val) => (isObject(val) && "value" in val ? val.value : val))
          .join(", "),
      _otherwise: () =>
        isObject(item) && "value" in item ? item.value : "Error!",
    })
