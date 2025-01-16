import { Html } from "@elysiajs/html"

interface Props {
  error: Error
}

export function Error(props: Props) {
  const { error } = props

  console.error(error)

  return (
    <div class="card error">
      <div class="content">{error.message}</div>
    </div>
  )
}
