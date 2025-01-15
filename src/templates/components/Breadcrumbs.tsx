import { Html } from "@elysiajs/html"
import type { HypermediaType } from "../../Hypermedia"

interface Props {
  pageTitle: string
  links: HypermediaType["Link"][]
}

export function Breadcrumbs(props: Props) {
  return (
    <div class="breadcrumbs" style={{ marginBottom: "15px" }}>
      {props.links.flatMap((part, i) => [
        <a href={part.href}>{part.value}</a>,
        <a>{" / "}</a>,
      ])}

      {props.pageTitle}
    </div>
  )
}
