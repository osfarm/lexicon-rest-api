import { Html } from "@elysiajs/html"
import type { HypermediaType } from "../../Hypermedia"

interface Props {
  pageTitle: string
  links: HypermediaType["Link"][]
}

export function Breadcrumbs(props: Props) {
  return props.links.length === 0 ? (
    ""
  ) : (
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      {props.links.map((part) => (
        <span>
          <a href={part.href}>{part.value}</a>
          <span class="separator" aria-hidden="true">
            /
          </span>
        </span>
      ))}
      <span aria-current="page">{props.pageTitle}</span>
    </nav>
  )
}
