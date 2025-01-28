import { Html } from "@elysiajs/html"

interface Props {
  children: any
}

export function Grid(props: Props) {
  return (
    <div
      class="grid"
      style={{
        display: "flex!important",
        width: "100%",
        height: "auto",
        margin: "0px",
        boxSizing: "border-box",
        padding: "10px",
        flexWrap: "wrap",
        flexDirection: "row",
      }}
    >
      {props.children}
    </div>
  )
}

interface CellProps {
  width: number
  children: any
}

export function Cell(props: CellProps) {
  const { width, children } = props

  const percent = `${(width / 12) * 100 - 1}%`

  return (
    <div
      style={{
        flexGrow: 0,
        display: "inherit",
        overflow: "hidden",
        marginLeft: "0.25em",
        marginRight: "0.25em",
        marginTop: "0.25em",
        marginBottom: "0.25em",
        width: percent,
        flexBasis: percent,
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  )
}
