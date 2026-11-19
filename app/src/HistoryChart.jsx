import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { formatDate, formatNumber } from './model'

Chart.register(...registerables)

export default function HistoryChart({ points, tankHeight }) {
  const canvas = useRef(null)
  useEffect(() => {
    const element = canvas.current
    const dateLabel = new Intl.DateTimeFormat('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const chart = new Chart(element, {
      type: 'line',
      data: { datasets: [{
        label: 'ระดับน้ำ',
        data: points.map(({ ts, level }) => ({ x: ts, y: level ?? null })),
        borderColor: '#36d7ed',
        borderWidth: 2.5,
        backgroundColor: (context) => {
          const { chartArea, ctx } = context.chart
          if (!chartArea) return 'rgba(54,215,237,.12)'
          const shade = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          shade.addColorStop(0, 'rgba(32,191,230,.30)')
          shade.addColorStop(1, 'rgba(32,191,230,.015)')
          return shade
        },
        pointRadius: points.length < 25 ? 3 : 0,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.27,
        spanGaps: false,
      }] },
      options: {
        parsing: false, responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: { type: 'linear', ticks: { color: '#93a9bd', maxTicksLimit: 5, callback: (value) => dateLabel.format(value) }, grid: { display: false } },
          y: { min: 0, max: tankHeight, ticks: { color: '#93a9bd', maxTicksLimit: 5, callback: (value) => formatNumber(value) + ' cm' }, grid: { color: '#24334a' }, border: { display: false } },
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: (items) => formatDate(items[0]?.parsed.x),
          label: ({ parsed }) => formatNumber(parsed.y) + ' cm',
        } } },
      },
    })
    return () => chart.destroy()
  }, [points, tankHeight])
  return <div className="chart-canvas"><canvas ref={canvas} role="img" aria-label="กราฟระดับน้ำย้อนหลัง หน่วยเซนติเมตร" /></div>
}
