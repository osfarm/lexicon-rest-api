import { match, type AsyncResult } from "shulk"
import { Hypermedia, hypermedia2json, type HypermediaType } from "../Hypermedia"
import type { Context } from "../types/Context"
import { ResourcePage } from "../templates/views/ResourcePage"

interface ResourcePageParams {
  breadcrumbs: HypermediaType["Link"][]
  handler: (id: string) => AsyncResult<
    Error,
    {
      title: string
      details: Record<string, Hypermedia | undefined>
      sections: Record<string, HypermediaType["Link"] | undefined>
      links: HypermediaType["Link"][]
    }
  >
}

export async function generateResourcePage(cxt: Context, params: ResourcePageParams) {
  const [id, output = "html"] = Object.values(cxt.params)[0].split(".")

  const pageDataResult = await params.handler(id)

  const page = pageDataResult.map((data) => ({
    title: data.title,
    breadcrumbs: params.breadcrumbs,
    details: data.details,
    sections: data.sections,
    links: data.links,
  }))

  return match(output)
    .returnType<any>()
    .case({
      json: () => hypermedia2json(cxt.request, page.val),
      html: () => ResourcePage({ page, t: cxt.t }),
      _otherwise: () => `This resource is not available in the '${output}' format`,
    })
}
