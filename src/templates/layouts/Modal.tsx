import { Html } from "@elysiajs/html"

interface Props {
  children: any
}

export function Modal(props: Props) {
  return (
    <div
      class="modal modal-blur fade"
      style="display: none"
      aria-hidden="false"
      tabindex="-1"
    >
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">{props.children}</div>
      </div>
    </div>
  )
}
