// The map of the parcel identifier: a point is put by a click, by dragging the marker, by typing its
// coordinates or by asking the browser where one stands. Nothing is sent before the visitor asks.
;(function () {
  var box = document.getElementById("place-map")
  if (!box || typeof L === "undefined") return

  var form = document.getElementById("place-form")
  var latitude = document.getElementById("latitude")
  var longitude = document.getElementById("longitude")
  var locate = document.getElementById("place-locate")
  var status = document.getElementById("place-status")
  var data = box.dataset
  var start = [parseFloat(data.latitude), parseFloat(data.longitude)]

  // The wheel scrolls the page until the map is clicked: a map that zooms under a passing cursor
  // moves the point without being asked
  var map = L.map(box, { scrollWheelZoom: false }).setView(start, parseInt(data.zoom, 10))
  map.on("click", function () { map.scrollWheelZoom.enable() })
  box.addEventListener("mouseleave", function () { map.scrollWheelZoom.disable() })

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)

  var pin = L.divIcon({ className: "place-pin", iconSize: [28, 28], iconAnchor: [14, 14] })
  var marker = L.marker(start, { icon: pin, draggable: true, keyboard: false }).addTo(map)

  var shape = document.getElementById("place-shape")
  if (shape) {
    var parcel = L.geoJSON(JSON.parse(shape.textContent), {
      interactive: false,
      style: { color: "#125e6f", weight: 3, fillColor: "#2f8f89", fillOpacity: 0.22 },
    }).addTo(map)
    map.fitBounds(parcel.getBounds(), { padding: [48, 48], maxZoom: 17 })
  }

  function write(point) {
    latitude.value = point.lat.toFixed(6)
    longitude.value = point.lng.toFixed(6)
  }
  function put(point) {
    marker.setLatLng(point)
    write(point)
  }

  map.on("click", function (event) { put(event.latlng) })
  marker.on("drag", function () { write(marker.getLatLng()) })

  function typed() {
    var point = L.latLng(parseFloat(latitude.value), parseFloat(longitude.value))
    if (isNaN(point.lat) || isNaN(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return
    marker.setLatLng(point)
    map.panTo(point)
  }
  latitude.addEventListener("change", typed)
  longitude.addEventListener("change", typed)

  if (locate) {
    locate.addEventListener("click", function () {
      status.textContent = locate.dataset.searching
      map.locate({ setView: true, maxZoom: 16 })
    })
    map.on("locationfound", function (event) {
      put(event.latlng)
      status.textContent = ""
    })
    map.on("locationerror", function () { status.textContent = locate.dataset.failed })
  }

  form.addEventListener("submit", function () {
    var button = form.querySelector("button[type=submit]")
    button.classList.add("is-loading")
    status.textContent = button.dataset.searching
  })
})()
