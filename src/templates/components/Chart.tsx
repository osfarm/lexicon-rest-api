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
  }
>

type Values = Record<string, Record<string, unknown>>

interface Props {
  legend: Legend
  values: Values
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
  }))

  return (
    <>
      <div id={"chart-" + uniqid} style="width: 100%;height:400px;"></div>

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

  toolbox: {
    feature: {
      dataView: { show: true, readOnly: false },
      saveAsImage: { show: true }
    }
  },
  legend: ${JSON.stringify(echartsLegend)},
  xAxis: ${JSON.stringify(echartsX)},
  yAxis: ${JSON.stringify(echartsY)},
  series: ${JSON.stringify(echartsSeries)}
};

option && myChart.setOption(option);

       
        }`}{" "}
      </script>
    </>
  )
}
