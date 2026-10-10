import { Html } from "@elysiajs/html"

type Legend = Record<
  string,
  {
    label: string
    unit: string
    color: string
    type: "line" | "bar"
    side: "left" | "right"
    stack?: string
    // A line drawn dashed, as an average beside what was measured
    dashed?: boolean
  }
>

type Values = Record<string, Record<string, unknown>>

interface Props {
  legend: Legend
  values: Values
  // Pixels; 400 when not given
  height?: number
  // Without the toolbox, in the typeface of the page: a chart read in passing, inside a record
  plain?: boolean
}

export function Chart(props: Props) {
  const { legend, values } = props

  const uniqid = Math.round(Math.random() * 1000)

  const echartsColor = Object.values(legend).map((item) => item.color)

  const echartsLegend = { data: Object.values(legend).map((item) => item.label) }

  const echartsX = [
    { type: "category", axisTick: { alignWithLabel: true }, data: Object.keys(values) },
  ]

  // Deduplicate Y axes by side: series sharing the same side share one axis.
  // Axis label uses the unit (since multiple series can map to one axis).
  // Axis line color follows the first series on that side.
  const sides: ("left" | "right")[] = []
  for (const item of Object.values(legend)) {
    if (!sides.includes(item.side)) sides.push(item.side)
  }

  const echartsY = sides.map((side) => {
    const itemsOnSide = Object.values(legend).filter((i) => i.side === side)
    const first = itemsOnSide[0]
    return {
      type: "value",
      name: first.unit,
      position: side,
      alignTicks: true,
      axisLine: {
        show: true,
        lineStyle: {
          color: first.color,
        },
      },
      axisLabel: {
        formatter: `{value} ${first.unit}`,
      },
    }
  })

  const echartsSeries = Object.entries(legend).map(([key, item]) => ({
    name: item.label,
    type: item.type,
    yAxisIndex: sides.indexOf(item.side),
    data: Object.values(values).map((entry) => entry[key]),
    stack: item.stack,
    ...(item.dashed ? { lineStyle: { type: "dashed" }, symbol: "none" } : {}),
    ...(props.plain && item.type === "line" ? { smooth: false, lineStyle: { width: 3, ...(item.dashed ? { type: "dashed", width: 2 } : {}) } } : {}),
    ...(props.plain && item.type === "bar" ? { barMaxWidth: 18 } : {}),
  }))

  const height = props.height ?? 400
  const toolbox = props.plain
    ? {}
    : { feature: { dataView: { show: true, readOnly: false }, saveAsImage: { show: true } } }
  const textStyle = props.plain
    ? { fontFamily: '"OSFarm Ubuntu", "Helvetica Neue", Arial, sans-serif', color: "#0e3d48" }
    : {}
  const grid = props.plain ? { left: 8, right: 8, top: 48, bottom: 8, containLabel: true } : undefined

  return (
    <>
      <div id={"chart-" + uniqid} style={`width: 100%;height:${height}px;`}></div>

      <script src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js"></script>

      <script>
        {` {   var chartDom = document.getElementById('chart-${uniqid}');
var myChart = echarts.init(chartDom);

let option = {
  color: ${JSON.stringify(echartsColor)},
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross'
    }
  },

  toolbox: ${JSON.stringify(toolbox)},
  textStyle: ${JSON.stringify(textStyle)},
  ${grid ? `grid: ${JSON.stringify(grid)},` : ""}
  legend: ${JSON.stringify(echartsLegend)},
  xAxis: ${JSON.stringify(echartsX)},
  yAxis: ${JSON.stringify(echartsY)},
  series: ${JSON.stringify(echartsSeries)}
};

option && myChart.setOption(option);
window.addEventListener('resize', function () { myChart.resize() });
window.addEventListener('load', function () { myChart.resize() });

       
        }`}{" "}
      </script>
    </>
  )
}
