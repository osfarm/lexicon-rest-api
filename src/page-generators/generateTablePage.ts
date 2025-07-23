import { Concurrently, match, Ok } from "shulk"
import type { t_Select } from "../Database"
import {
  Hypermedia,
  hypermedia2csv,
  hypermedia2json,
  type HypermediaType,
} from "../Hypermedia"
import type { FieldType } from "../templates/components/Form"
import { createHref, ObjectMap } from "../utils"
import { AutoTable, type AutoTableOkInput } from "../templates/views/AutoTable"
import type { Credit } from "../namespaces/Credits"
import type { Context } from "../types/Context"

interface AutoTableParams<T extends object, F extends string> {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  form?: Record<string, FieldType["any"]>
  formHandler?: (input: Record<string, unknown | undefined>, query: t_Select<T>) => void
  query: t_Select<T>
  credits?: t_Select<Credit>
  columns: Record<F, string>
  handler: (obj: T) => Record<F, HypermediaType["any"] | undefined>
}

export async function generateTablePage<T extends object, F extends string>(
  context: Context,
  params: AutoTableParams<T, F>,
) {
  const PER_PAGE = 150

  const { path, request, query: queryParams, t, output } = context

  const page = typeof queryParams?.page === "string" ? parseInt(queryParams.page) : 1

  const basePath = path.split("?")[0].split(".")[0]

  const enhancedQuery = params.query.limit(PER_PAGE).offset((page - 1) * PER_PAGE)

  if (params.formHandler) {
    params.formHandler(queryParams || {}, enhancedQuery)
  }

  // prettier-ignore
  const result = await Concurrently
    .run(() => enhancedQuery.run())
    .and(() => params.query.count())
    .and<Error, Credit[]>(async () => params.credits?.run() || Ok([]))
    .done()

  const pageData = result
    .map(
      ([items, count, credit]) =>
        ({
          items,
          count,
          totalPages: Math.ceil(count / PER_PAGE),
          credit,
        } as const),
    )
    .map(
      ({ items, count, totalPages, credit }): AutoTableOkInput => ({
        title: params.title,
        breadcrumbs: params.breadcrumbs,
        form: params.form
          ? ObjectMap(params.form, (key, field) => ({
              ...field,
              defaultValue: queryParams[key] as any,
            }))
          : undefined,
        table: {
          columns: params.columns,
          rows: items.map(params.handler),
        },
        credit: credit[0]
          ? {
              provider: Hypermedia.Text({
                label: t("credits_provider"),
                value: credit[0].provider,
              }),
              website: Hypermedia.Link({
                label: t("credits_website"),
                value: credit[0].url.replace(/(.{64})..+/, "$1&hellip;"),
                icon: "/public/icons/link.svg",
                method: "GET",
                href: credit[0].url,
              }),
              date: Hypermedia.Date({
                label: t("credits_date"),
                value: context.dateTimeFormatter.Date(credit[0].updated_at),
                iso: credit[0].updated_at.toISOString(),
              }),
              license: credit[0].licence
                ? Hypermedia.Link({
                    label: t("credits_license"),
                    value: credit[0].licence,
                    icon: "/public/icons/scroll.svg",
                    method: "GET",
                    href: credit[0].licence_url,
                  })
                : undefined,
            }
          : undefined,
        "items-per-page": PER_PAGE,
        "items-count": items.length,
        "items-total": count,
        page: page,
        "total-pages": totalPages,
        pages: Array(totalPages)
          .fill(0)
          .map((_, i) => i + 1)
          .slice(Math.max(page - 1 - 5, 0), page - 1 + 6)
          .map((p) =>
            Hypermedia.Link({
              value: p.toString(),
              method: "GET",
              href: createHref(path, {
                ...context.query,
                page: p,
              }),
            }),
          ),
        navigation: {
          "first-page":
            page !== 1
              ? Hypermedia.Link({
                  value: "1",
                  method: "GET",
                  href: createHref(path, {
                    ...context.query,
                    page: 1,
                  }),
                })
              : undefined,
          "previous-page":
            page > 1
              ? Hypermedia.Link({
                  value: t("navigation_previous_page"),
                  method: "GET",
                  href: createHref(path, {
                    ...context.query,
                    page: page - 1,
                  }),
                })
              : undefined,
          "next-page":
            page < totalPages
              ? Hypermedia.Link({
                  value: t("navigation_next_page"),
                  method: "GET",
                  href: createHref(path, {
                    ...context.query,
                    page: page + 1,
                  }),
                })
              : undefined,
          "last-page":
            page !== totalPages
              ? Hypermedia.Link({
                  value: totalPages.toString(),
                  method: "GET",
                  href: createHref(path, {
                    ...context.query,
                    page: totalPages,
                  }),
                })
              : undefined,
        },
        formats: {
          html: Hypermedia.Link({
            value: "HTML",
            method: "GET",
            href: createHref(basePath, context.query),
          }),
          json: Hypermedia.Link({
            value: "JSON",
            method: "GET",
            href: createHref(basePath + ".json", context.query),
          }),
          csv: Hypermedia.Link({
            value: "CSV",
            method: "GET",
            href: createHref(basePath + ".csv", context.query),
          }),
        },
      }),
    )
    .mapErr((error) => ({
      title: params.title,
      breadcrumbs: params.breadcrumbs,
      form: params.form,
      error: error,
    }))

  return match(output)
    .returnType<string | object>()
    .case({
      html: () => AutoTable({ page: pageData, context }),
      json: () => hypermedia2json(request, pageData.val),
      csv: () => hypermedia2csv(pageData.val),
      _otherwise: () => new Response("Output format not supported.", { status: 400 }),
    })
}
