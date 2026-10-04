import { Html } from "@elysiajs/html"

interface Props {
  children: any
}

export function Grid(props: Props) {
  return <div class="grid">{props.children}</div>
}

interface CellProps {
  // Out of twelve columns
  width: number
  children: any
}

export function Cell(props: CellProps) {
  return (
    <div class="cell" style={`--span: ${props.width}`}>
      {props.children}
    </div>
  )
}
