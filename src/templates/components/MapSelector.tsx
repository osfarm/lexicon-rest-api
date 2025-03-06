import { Html } from "@elysiajs/html"
import { type Geometry } from "../../types/Geometry"
import type { Coordinates } from "../../types/Coordinates"
import type { Translator } from "../../Translator"
import { Cell, Grid } from "./Grid"

interface Props {
  center: Coordinates
  t: Translator
  marker?: Coordinates
  shape?: Geometry
}

const DEFAULT_ZOOM = 16

export function MapSelector(props: Props) {
  const uniqid = Date.now()

  const marker = props.marker
    ? `marker = L.marker([${props.marker.latitude}, ${props.marker.longitude}]).addTo(map${uniqid});`
    : ""

  const shape = props.shape
    ? `L.geoJSON(${JSON.stringify(
        props.shape,
      )}, {onEachFeature: onEachFeature}).addTo(map${uniqid})`
    : ""

  return (
    <>
      <form>
        {" "}
        <Grid>
          <Cell width={8}>
            {" "}
            <div id={"map-" + uniqid} style={{ width: "100%", height: "300px" }}></div>
          </Cell>

          <Cell width={4}>
            <div
              style={{
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Grid>
                {" "}
                <Cell width={12}>
                  <i>{props.t("map_selector_label")}</i>
                </Cell>
                <Cell width={12}>
                  <div class="field">
                    <label for={"latitude"}>{props.t("common_fields_latitude")}</label>
                    <br />
                    <input
                      type="number"
                      step="any"
                      autocomplete="off"
                      id={"latitude"}
                      name={"latitude"}
                      required={true}
                      placeholder={props.t("common_fields_latitude")}
                      value={
                        props.marker?.latitude.toString() ||
                        props.center.latitude.toString()
                      }
                    ></input>
                    {"°"}
                  </div>
                </Cell>
                <Cell width={12}>
                  <div class="field">
                    <label for={"latitude"}>{props.t("common_fields_longitude")}</label>
                    <br />
                    <input
                      type="number"
                      step="any"
                      autocomplete="off"
                      id={"longitude"}
                      name={"longitude"}
                      required={true}
                      placeholder={props.t("common_fields_longitude")}
                      value={
                        props.marker?.longitude.toString() ||
                        props.center.longitude.toString()
                      }
                    ></input>
                    {"°"}
                  </div>
                </Cell>
                <Cell width={12}>
                  <input type="submit" class="success shadow button"></input>
                </Cell>
              </Grid>
            </div>
          </Cell>
        </Grid>
      </form>

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

      {`
      <script> 
        function onEachFeature(feature, layer) {
            if (feature.properties && feature.properties.html) {
                layer.bindPopup(feature.properties.html);
            }
        }

        let map${uniqid} = L.map('map-${uniqid}')
            .setView([${props.center.latitude}, ${
        props.center.longitude
      }], ${DEFAULT_ZOOM});
        
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          })
          .addTo(map${uniqid});


        let marker


        ${
          !props.marker
            ? `map${uniqid}.locate({setView: true, maxZoom: 16});`
            : `map${uniqid}.setView([${props.marker.latitude}, ${props.marker.longitude}])`
        }

        function onMove(e) {
            const center = map${uniqid}.getCenter();
            if (marker) {
                marker.setLatLng(center)
            } else {
               marker = L.marker(center);
                marker.addTo(map${uniqid});
            }
          
            document.querySelector('#latitude').value = center.lat
            document.querySelector('#longitude').value = center.lng      
        }

        map${uniqid}.on('move', onMove);        
        map${uniqid}.on('zoom', onMove);        

        ${marker}
        ${shape}
      </script>
      `}
    </>
  )
}
