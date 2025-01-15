import { html, Html } from "@elysiajs/html"
import type { HypermediaType } from "../Hypermedia"
import { Layout } from "./Layout"
import { isObject, match } from "shulk"
import type { Translator } from "../Translator"

interface PageData {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  fields: Record<string, string>
  items: Record<string, HypermediaType["any"] | undefined>[]
  t: Translator
}

export function AutoTable(page: PageData) {
  return (
    <Layout title={page.title} breadcrumbs={page.breadcrumbs}>
      <table>
        <thead>
          <tr>
            {Object.values(page.fields).map((field) => (
              <th>{field}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {page.items.map((item) => (
            <tr>
              {Object.keys(page.fields).map((field) => (
                <td>
                  {item[field] === undefined ? (
                    <i>{page.t("common_undefined")}</i>
                  ) : (
                    parseHypermedia(item[field])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

const parseHypermedia = (item: HypermediaType["any"]) =>
  match(item).case({
    List: (item) =>
      item.values
        .map((val) => (isObject(val) && "value" in val ? val.value : val))
        .join(", "),
    _otherwise: () => item.value,
  })
