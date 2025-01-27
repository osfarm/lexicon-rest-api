import { Html } from "@elysiajs/html"

interface Props {
  info?: boolean
  children: any
}

export function Card(props: Props) {
  const { info, children } = props

  const classes = ["card"]

  if (info) {
    classes.push("info")
  }

  return (
    <div class={classes}>
      <div class="content">{children}</div>
    </div>
  )
}
