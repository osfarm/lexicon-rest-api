import { Html } from "@elysiajs/html"

interface Props {
  children: any
}

export function Grid(props: Props) {
  return (
    <section
      class="grid"
      style={{
        flexGrow: 0,
        display: "flex",
        maxWidth: "100%",
        flexBasis: "100%",
        height: "auto",
        margin: "0px",
        boxSizing: "border-box",
        padding: "10px",
      }}
    >
      {props.children}
    </section>
  )
}

interface CellProps {
  width: number
  children: any
}

export function Cell(props: CellProps) {
  const { width, children } = props

  const percent = `${(width / 12) * 100}%`

  return (
    <div
      style={{
        flexGrow: 0,
        display: "inherit",
        overflow: "none",
        marginLeft: "0.25em",
        marginRight: "0.25em",
        maxWidth: percent,
        flexBasis: percent,
      }}
    >
      {children}
    </div>
  )
}
