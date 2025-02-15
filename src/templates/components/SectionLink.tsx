import { Html } from "@elysiajs/html"

const SECTION_TEXT_STYLE = {
  flexGrow: 1,
  textAlign: "center",
  marginLeft: "10px",
  fontSize: "1.3em",
} as const

interface Props {
  href: string
  target?: "_blank"
  icon: string
  children: any
}

export function SectionLink(props: Props) {
  return (
    <a href={props.href} target={props.target} class="section-link">
      <img src={props.icon} height={32} />
      <span style={SECTION_TEXT_STYLE}>{props.children}</span>
    </a>
  )
}
