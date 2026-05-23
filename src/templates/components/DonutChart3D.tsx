import { Html } from "@elysiajs/html"

export interface DonutSegment {
  label: string
  value: number
  color: string
}

interface Props {
  segments: DonutSegment[]
  unit: string
  height?: number
  legendTitle?: string
}

export function DonutChart3D(props: Props) {
  const uniqid = Math.round(Math.random() * 1e9)
  const height = props.height ?? 480

  // Drop zero-value segments — they'd produce degenerate surfaces.
  const segments = props.segments.filter((s) => s.value > 0)

  const segmentsJson = JSON.stringify(segments)
  const unitJson = JSON.stringify(props.unit)
  const legendTitleJson = JSON.stringify(props.legendTitle ?? "")

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: "15px",
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <div
          id={"donut3d-wrap-" + uniqid}
          style={{
            flex: "1 1 55%",
            minWidth: "320px",
            height: height + "px",
            position: "relative",
          }}
        >
          <div
            id={"donut3d-" + uniqid}
            style={{ width: "100%", height: "100%" }}
          ></div>
          <div
            id={"donut3d-overlay-" + uniqid}
            style={{
              position: "absolute",
              top: "0",
              left: "0",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          ></div>
        </div>
        <div
          id={"donut3d-legend-" + uniqid}
          style={{
            flex: "1 1 35%",
            minWidth: "240px",
            maxHeight: height + "px",
            overflowY: "auto",
            padding: "5px 10px",
            border: "1px solid hsla(0,0%,100%,0.15)",
            borderRadius: "8px",
          }}
        ></div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js"></script>

      <script>
        {`
        (function() {
          var segments = ${segmentsJson};
          var unit = ${unitJson};
          var legendTitle = ${legendTitleJson};
          var chartDom = document.getElementById('donut3d-${uniqid}');
          var legendDom = document.getElementById('donut3d-legend-${uniqid}');
          if (!chartDom || !legendDom || !segments.length) return;

          var overlayDom = document.getElementById('donut3d-overlay-${uniqid}');
          var visibility = segments.map(function() { return true; });
          var selectedIdx = -1;
          var chart = echarts.init(chartDom);

          var ALPHA_DEG = 40;
          var BETA_DEG = 30;

          function getParametricEquation(startRatio, endRatio, isSelected, k, h) {
            var midRatio = (startRatio + endRatio) / 2;
            var startRadian = startRatio * Math.PI * 2;
            var endRadian = endRatio * Math.PI * 2;
            var midRadian = midRatio * Math.PI * 2;
            if (startRatio === 0 && endRatio === 1) isSelected = false;
            var offsetX = isSelected ? Math.cos(midRadian) * 0.15 : 0;
            var offsetY = isSelected ? Math.sin(midRadian) * 0.15 : 0;
            return {
              u: { min: -Math.PI, max: Math.PI * 3, step: Math.PI / 32 },
              v: { min: 0, max: Math.PI * 2, step: Math.PI / 20 },
              x: function(u, v) {
                if (u < startRadian) return offsetX + Math.cos(startRadian) * (1 + Math.cos(v) * k);
                if (u > endRadian) return offsetX + Math.cos(endRadian) * (1 + Math.cos(v) * k);
                return offsetX + Math.cos(u) * (1 + Math.cos(v) * k);
              },
              y: function(u, v) {
                if (u < startRadian) return offsetY + Math.sin(startRadian) * (1 + Math.cos(v) * k);
                if (u > endRadian) return offsetY + Math.sin(endRadian) * (1 + Math.cos(v) * k);
                return offsetY + Math.sin(u) * (1 + Math.cos(v) * k);
              },
              z: function(u, v) {
                if (u < -Math.PI * 0.5) return Math.sin(u);
                if (u > Math.PI * 2.5) return Math.sin(u) * h * 0.1;
                return Math.sin(v) > 0 ? 1 * h : -1;
              }
            };
          }

          function buildOption() {
            var visibleSegs = [];
            for (var i = 0; i < segments.length; i++) {
              if (visibility[i]) visibleSegs.push({ seg: segments[i], idx: i });
            }
            var visibleTotal = 0;
            for (var i = 0; i < visibleSegs.length; i++) visibleTotal += visibleSegs[i].seg.value;
            if (visibleTotal === 0) return { series: [] };

            var series = [];
            var acc = 0;
            for (var i = 0; i < visibleSegs.length; i++) {
              var item = visibleSegs[i];
              var startRatio = acc / visibleTotal;
              acc += item.seg.value;
              var endRatio = acc / visibleTotal;
              var isSel = (item.idx === selectedIdx);
              series.push({
                name: item.seg.label,
                type: 'surface',
                parametric: true,
                wireframe: { show: false },
                shading: 'realistic',
                realisticMaterial: { roughness: 0.6, metalness: 0.1 },
                itemStyle: { color: item.seg.color, opacity: 1 },
                parametricEquation: getParametricEquation(startRatio, endRatio, isSel, 0.55, 0.5)
              });
            }
            return {
              tooltip: { show: false },
              xAxis3D: { show: false, min: -2, max: 2 },
              yAxis3D: { show: false, min: -2, max: 2 },
              zAxis3D: { show: false, min: -1, max: 1.5 },
              grid3D: {
                show: false,
                boxWidth: 200,
                boxDepth: 200,
                boxHeight: 40,
                viewControl: {
                  alpha: ALPHA_DEG,
                  beta: BETA_DEG,
                  distance: 220,
                  autoRotate: false,
                  rotateMouseButton: null,
                  zoomSensitivity: 0
                },
                light: {
                  main: { intensity: 1.2, shadow: false },
                  ambient: { intensity: 0.4 }
                }
              },
              series: series
            };
          }

          function renderChart() {
            chart.setOption(buildOption(), true);
            renderOverlay();
          }

          function renderOverlay() {
            overlayDom.innerHTML = '';
            var visibleSegs = [];
            for (var i = 0; i < segments.length; i++) {
              if (visibility[i]) visibleSegs.push({ seg: segments[i], idx: i });
            }
            var visibleTotal = 0;
            for (var i = 0; i < visibleSegs.length; i++) visibleTotal += visibleSegs[i].seg.value;
            if (visibleTotal === 0) return;

            var w = overlayDom.clientWidth;
            var h = overlayDom.clientHeight;
            var cx = w / 2;
            var cy = h / 2 + h * 0.04;
            var Rlabel = Math.min(w, h) * 0.42;
            var alpha = ALPHA_DEG * Math.PI / 180;
            var beta = BETA_DEG * Math.PI / 180;
            var foreshorten = Math.cos(alpha);

            var acc = 0;
            for (var i = 0; i < visibleSegs.length; i++) {
              var item = visibleSegs[i];
              var startRatio = acc / visibleTotal;
              acc += item.seg.value;
              var endRatio = acc / visibleTotal;
              var midRatio = (startRatio + endRatio) / 2;
              var pct = (item.seg.value / visibleTotal) * 100;
              if (pct < 3) continue;

              // The 3D camera rotates the chart by beta around the z-axis:
              // a world-space angle of midRadian appears at screen angle (midRadian - beta).
              var midRad = midRatio * 2 * Math.PI - beta;
              var x = cx + Math.cos(midRad) * Rlabel;
              var y = cy - Math.sin(midRad) * Rlabel * foreshorten;

              var lbl = document.createElement('div');
              lbl.style.cssText = 'position:absolute; left:' + x.toFixed(1) + 'px; top:' + y.toFixed(1) + 'px; ' +
                'transform:translate(-50%,-50%); background:rgba(0,0,0,0.75); color:#fff; ' +
                'padding:3px 7px; border-radius:4px; font-size:11px; white-space:nowrap; ' +
                'box-shadow:0 1px 3px rgba(0,0,0,0.4); border:1px solid ' + item.seg.color + ';';
              lbl.textContent = item.seg.value.toFixed(2) + ' ' + unit + ' (' + pct.toFixed(1) + '%)';
              overlayDom.appendChild(lbl);
            }
          }

          window.addEventListener('resize', renderOverlay);

          function renderLegend() {
            legendDom.innerHTML = '';
            if (legendTitle) {
              var h = document.createElement('div');
              h.style.cssText = 'font-weight:bold; margin-bottom:6px;';
              h.textContent = legendTitle;
              legendDom.appendChild(h);
            }
            var visibleTotal = 0;
            for (var j = 0; j < segments.length; j++) {
              if (visibility[j]) visibleTotal += segments[j].value;
            }
            for (var i = 0; i < segments.length; i++) {
              (function(idx) {
                var seg = segments[idx];
                var pct = (visibility[idx] && visibleTotal > 0)
                  ? (seg.value / visibleTotal * 100)
                  : 0;
                var row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:3px 0; cursor:pointer; font-size:0.88em;';

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = visibility[idx];
                cb.style.cssText = 'cursor:pointer; flex-shrink:0;';
                cb.addEventListener('change', function(e) {
                  e.stopPropagation();
                  visibility[idx] = cb.checked;
                  renderChart();
                  renderLegend();
                });

                var swatch = document.createElement('span');
                swatch.style.cssText = 'display:inline-block; width:12px; height:12px; background:' + seg.color + '; border:1px solid #444; flex-shrink:0;';

                var label = document.createElement('span');
                label.style.cssText = 'flex:1; ' + (idx === selectedIdx ? 'font-weight:bold;' : '');
                var pctText = visibility[idx] ? ' (' + pct.toFixed(1) + '%)' : '';
                label.textContent = seg.label + ' — ' + seg.value.toFixed(2) + ' ' + unit + pctText;

                row.appendChild(cb);
                row.appendChild(swatch);
                row.appendChild(label);

                row.addEventListener('click', function(e) {
                  if (e.target === cb) return;
                  selectedIdx = (selectedIdx === idx) ? -1 : idx;
                  renderChart();
                  renderLegend();
                });

                legendDom.appendChild(row);
              })(i);
            }
          }

          renderChart();
          renderLegend();
        })();
        `}
      </script>
    </>
  )
}
