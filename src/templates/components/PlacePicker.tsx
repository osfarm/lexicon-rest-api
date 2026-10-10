import { Html } from "@elysiajs/html"
import { asset } from "../Assets"
import type { Coordinates } from "../../types/Coordinates"
import type { Geometry } from "../../types/Geometry"
import type { Translator } from "../../Translator"

interface Props {
  t: Translator
  // Where the map opens when no point was asked for
  center: Coordinates
  // The point that was asked for, and the parcel found there
  point?: Coordinates
  shape?: Geometry
}

const ZOOM = 15

/**
 * The map and the two coordinates of the parcel identifier. The page works
 * without the script: the coordinates are a form, the map only helps to fill it.
 */
export function PlacePicker(props: Props) {
  const { t, center, point, shape } = props
  const shown = point ?? center

  return (
    <form class="place" id="place-form" method="get">
      <div
        class="place-map"
        id="place-map"
        data-latitude={String(shown.latitude)}
        data-longitude={String(shown.longitude)}
        data-zoom={String(ZOOM)}
        role="application"
        aria-label={t("tools_parcel_map")}
      ></div>

      <div class="place-panel">
        <h2>{t("tools_parcel_pick_title")}</h2>
        <p>{t("tools_parcel_pick_help")}</p>

        <div class="place-fields">
          <div class="field">
            <label for="latitude">{t("common_fields_latitude")}</label>
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              inputmode="decimal"
              autocomplete="off"
              id="latitude"
              name="latitude"
              required
              value={String(shown.latitude)}
            />
          </div>
          <div class="field">
            <label for="longitude">{t("common_fields_longitude")}</label>
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              inputmode="decimal"
              autocomplete="off"
              id="longitude"
              name="longitude"
              required
              value={String(shown.longitude)}
            />
          </div>
        </div>

        <div class="place-actions">
          <button
            class="button primary"
            type="submit"
            data-searching={t("tools_parcel_searching")}
          >
            {t("tools_parcel_identify")}
          </button>
          <button
            class="button small"
            type="button"
            id="place-locate"
            data-searching={t("tools_parcel_locating")}
            data-failed={t("tools_parcel_locate_failed")}
          >
            {t("tools_parcel_locate")}
          </button>
        </div>
        <p class="place-status" id="place-status" role="status"></p>
      </div>

      {shape ? (
        <script type="application/json" id="place-shape">
          {JSON.stringify(shape).replace(/</g, "\\u003c")}
        </script>
      ) : (
        ""
      )}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin=""
      />
      <script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""
      ></script>
      <script src={asset("place-picker.js")}></script>
    </form>
  )
}
