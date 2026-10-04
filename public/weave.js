// The weave of the home page: hovering a key or a dataset lights what it is
// linked to. Without this script the table still says everything.
;(function () {
  var weave = document.getElementById("weave")
  if (!weave) return

  var caption = document.getElementById("weave-caption")
  var rows = Array.prototype.slice.call(weave.querySelectorAll("tbody tr"))
  var steps = Array.prototype.slice.call(document.querySelectorAll("[data-step]"))
  var pinned = null

  function list(value) {
    return value ? value.split(" ") : []
  }

  // Lights the given keys and datasets, dims the rest; nothing given: all back to normal
  function show(keys, datasets, text) {
    var some = keys.length > 0 || datasets.length > 0

    weave.classList.toggle("focused", some)
    rows.forEach(function (row) {
      row.classList.toggle("lit", keys.indexOf(row.dataset.key) >= 0)
    })
    Array.prototype.forEach.call(weave.querySelectorAll("[data-dataset]"), function (cell) {
      cell.classList.toggle("lit", datasets.indexOf(cell.dataset.dataset) >= 0)
    })
    caption.textContent = text || caption.dataset.default
  }

  function showKey(row) {
    show([row.dataset.key], list(row.dataset.datasets), row.dataset.definition)
  }

  function rest() {
    if (pinned) showKey(pinned)
    else show([], [])
  }

  rows.forEach(function (row) {
    var button = row.querySelector("button")

    row.addEventListener("mouseenter", function () {
      showKey(row)
    })
    row.addEventListener("mouseleave", rest)
    button.addEventListener("focus", function () {
      showKey(row)
    })
    button.addEventListener("blur", rest)
    button.addEventListener("click", function () {
      pinned = pinned === row ? null : row
      rows.forEach(function (other) {
        other.querySelector("button").setAttribute("aria-pressed", String(other === pinned))
      })
      rest()
    })
  })

  // A dataset lights the keys it carries, and the datasets those keys lead to
  Array.prototype.forEach.call(weave.querySelectorAll("thead [data-dataset]"), function (head) {
    function light() {
      var name = head.dataset.dataset
      var carrying = rows.filter(function (row) {
        return list(row.dataset.datasets).indexOf(name) >= 0
      })
      var linked = carrying.reduce(function (all, row) {
        return all.concat(list(row.dataset.datasets))
      }, [])

      show(
        carrying.map(function (row) {
          return row.dataset.key
        }),
        linked,
        ""
      )
    }

    head.addEventListener("mouseenter", light)
    head.addEventListener("mouseleave", rest)
    head.addEventListener("focusin", light)
    head.addEventListener("focusout", rest)
  })

  // Each step of the question followed below the weave lights what it goes through
  steps.forEach(function (step) {
    function light() {
      steps.forEach(function (other) {
        other.classList.toggle("lit", other === step)
      })
      show(list(step.dataset.keys), list(step.dataset.datasets), step.dataset.text)
    }
    function dim() {
      step.classList.remove("lit")
      rest()
    }

    step.addEventListener("mouseenter", light)
    step.addEventListener("mouseleave", dim)
    step.addEventListener("focusin", light)
    step.addEventListener("focusout", dim)
  })
})()
