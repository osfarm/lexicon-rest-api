import { html, Html } from "@elysiajs/html"
import type { HypermediaType } from "../Hypermedia"
import { Layout } from "./Layout"
import { isObject, match, type Result } from "shulk"
import type { Translator } from "../Translator"
import { Error } from "./components/Error"
import { Form, type FieldType } from "./components/Form"

interface PageData {
  page: Result<
    {
      title: string
      breadcrumbs: HypermediaType["Link"][]
      form?: Record<string, FieldType["any"]>
      error: Error
    },
    {
      title: string
      breadcrumbs: HypermediaType["Link"][]
      form?: Record<string, FieldType["any"]>
      table: {
        columns: Record<string, string>
        rows: Record<string, HypermediaType["any"] | undefined>[]
      }
      page: number
      "total-pages": number
      navigation: {
        "previous-page": HypermediaType["Link"] | undefined
        "next-page": HypermediaType["Link"] | undefined
      }
    }
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

          {` ${page.page} / ${page["total-pages"]} `}

          {page.navigation["next-page"] ? (
            <a href={page.navigation["next-page"].href} class="button">
              {page.navigation["next-page"].value + " >"}
            </a>
          ) : undefined}
        </div>
      </Layout>
    ),
  })
}

const parseHypermedia = (item: HypermediaType["any"]) =>
  match(item).case({
    List: (item) =>
      item.values
        .map((val) => (isObject(val) && "value" in val ? val.value : val))
        .join(", "),
    _otherwise: () =>
      isObject(item) && "value" in item ? item.value : "Error!",
  })
