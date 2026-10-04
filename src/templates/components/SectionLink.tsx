import { Html } from "@elysiajs/html"

interface Props {
  href: string
  target?: "_blank"
  "icon-left"?: string
  "icon-right"?: string
  children: any
}

export function SectionLink(props: Props) {
  return (
    <a href={props.href} target={props.target} class="section-link">
      {props["icon-left"] && <img src={props["icon-left"]} alt="" height={28} />}
      <span class="label">{props.children}</span>
      {props["icon-right"] && <img src={props["icon-right"]} alt="" height={28} />}
    </a>
  )
}
