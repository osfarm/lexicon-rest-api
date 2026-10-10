import { Html } from "@elysiajs/html"
import type { Translator } from "../../Translator"
import type { Veiled } from "../../preview/Preview"

/**
 * A reserved value: its start readable, the rest blurred.
 */
export function Veil(props: { value: Veiled | undefined }) {
  return props.value === undefined ? (
    <></>
  ) : (
    <>
      {Html.escapeHtml(props.value.start)}
      <span class="veiled" aria-hidden="true">
        {props.value.veil}
      </span>
    </>
  )
}

/**
 * The orange outline around data reserved to members, with why it is veiled.
 */
export function Reserved(props: { title?: string; wide?: boolean; t: Translator; children?: unknown }) {
  const { t } = props

  return (
    <div class={props.wide ? "reserved wide" : "reserved"}>
      <h3>
        {props.title ? Html.escapeHtml(props.title) + " " : ""}
        <span class="reserved-tag">{t("tools_reserved_tag")}</span>
      </h3>
      {props.children as JSX.Element}
      <p class="quiet">
        {t("tools_reserved_why")} <a href="https://www.osfarm.org/">{t("home_commons_join")}</a>
      </p>
    </div>
  )
}
