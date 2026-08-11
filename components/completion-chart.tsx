"use client"

import { useEffect, useRef } from "react"
import * as d3 from "d3"

type DayData = {
  day: number
  date: string
  averageCompletion: number
  averageTime: number
  totalStudents: number
  qualifiedStudents: number
  isExcluded: boolean
  sectionData: {
    sectionNumber: string
    completion: number
    time: number
    students: number
    qualified: number
  }[]
  discrepancy: number
}

type PeriodData = {
  period: string
  sections: string[]
  totalStudents: number
  averageCompletion: number
  averageTime: number
  dayStats: DayData[]
}

interface CompletionChartProps {
  data: PeriodData[]
  width?: number
  height?: number
}

export function CompletionChart({ data, width = 800, height = 400 }: CompletionChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null)
  const lastDataKeyRef = useRef<string | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  // Identity for "real" data changes — ignore parent re-renders that pass a new array wrapper
  const dataKey = data[0]
    ? `${data[0].period}:${data[0].dayStats.length}:${data[0].sections.join(",")}`
    : ""

  useEffect(() => {
    if (!dataKey || !svgRef.current || !containerRef.current) return

    const createChart = (animate: boolean) => {
      const chartData = dataRef.current
      if (!chartData.length || !svgRef.current || !containerRef.current) return

      const svg = d3.select(svgRef.current)
      svg.interrupt()
      svg.selectAll("*").interrupt()
      svg.selectAll("*").remove()

      const containerRect = containerRef.current.getBoundingClientRect()
      const containerWidth = containerRect.width || width
      const containerHeight = Math.min(containerRect.height || height, 400)

      lastSizeRef.current = {
        w: Math.round(containerWidth),
        h: Math.round(containerHeight),
      }

      svg.attr("width", containerWidth).attr("height", containerHeight)

      const margin = { top: 20, right: 80, bottom: 110, left: 60 }
      const innerWidth = containerWidth - margin.left - margin.right
      const innerHeight = containerHeight - margin.top - margin.bottom

      const xScale = d3.scaleLinear()
        .domain(d3.extent(chartData[0].dayStats, d => d.day) as [number, number])
        .range([0, innerWidth])

      const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([innerHeight, 0])

      const line = d3.line<DayData>()
        .x(d => xScale(d.day))
        .y(d => yScale(d.averageCompletion))
        .curve(d3.curveMonotoneX)

      const sectionLine = (sectionNumber: string) => d3.line<DayData>()
        .x(d => xScale(d.day))
        .y(d => {
          const sectionData = d.sectionData.find(s => s.sectionNumber === sectionNumber)
          return yScale(sectionData?.completion || 0)
        })
        .curve(d3.curveMonotoneX)

      const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`)

      g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale)
          .tickSize(-innerHeight)
          .tickFormat(() => "")
        )
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3)

      g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => "")
        )
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3)

      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale))

      const dayOfWeekScale = d3.scaleLinear()
        .domain(d3.extent(chartData[0].dayStats, d => d.day) as [number, number])
        .range([0, innerWidth])

      const dayLabels = chartData[0].dayStats.map(d => {
        const [year, month, day] = d.date.split('-').map(Number)
        const date = new Date(year, month - 1, day)
        const dayOfWeek = date.getDay()
        const dayNames = ['S', 'M', 'T', 'W', 'R', 'F', 'S']

        return {
          day: d.day,
          dayOfWeek: dayNames[dayOfWeek],
          x: dayOfWeekScale(d.day)
        }
      })

      g.append("g")
        .attr("transform", `translate(0,${innerHeight + 35})`)
        .selectAll("text")
        .data(dayLabels)
        .enter()
        .append("text")
        .attr("x", d => d.x)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .style("fill", "#6b7280")
        .text(d => d.dayOfWeek)

      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 55)
        .attr("fill", "currentColor")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Day")

      g.append("g")
        .call(d3.axisLeft(yScale))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -40)
        .attr("x", -innerHeight / 2)
        .attr("fill", "currentColor")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Completion %")

      const colorScale = d3.scaleOrdinal<string, string>()
        .domain(chartData[0].sections)
        .range(["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"])

      chartData[0].sections.forEach(sectionNumber => {
        const path = g.append("path")
          .datum(chartData[0].dayStats)
          .attr("fill", "none")
          .attr("stroke", colorScale(sectionNumber))
          .attr("stroke-width", 2)
          .style("opacity", 0.8)
          .attr("d", sectionLine(sectionNumber))

        if (animate) {
          const totalLength = path.node()?.getTotalLength() || 0
          if (totalLength > 0) {
            path
              .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
              .attr("stroke-dashoffset", totalLength)
              .transition()
              .duration(1500)
              .ease(d3.easeLinear)
              .attr("stroke-dashoffset", 0)
              .on("end", () => {
                path.attr("stroke-dasharray", "none")
              })
          }
        }
      })

      const combinedPath = g.append("path")
        .datum(chartData[0].dayStats)
        .attr("fill", "none")
        .attr("stroke", "#1f2937")
        .attr("stroke-width", 3)
        .style("opacity", 1)
        .attr("d", line)

      if (animate) {
        const combinedTotalLength = combinedPath.node()?.getTotalLength() || 0
        if (combinedTotalLength > 0) {
          combinedPath
            .attr("stroke-dasharray", `${combinedTotalLength} ${combinedTotalLength}`)
            .attr("stroke-dashoffset", combinedTotalLength)
            .transition()
            .duration(2000)
            .ease(d3.easeLinear)
            .attr("stroke-dashoffset", 0)
            .on("end", () => {
              combinedPath.attr("stroke-dasharray", "none")
            })
        }
      }

      const dots = g.selectAll(".dot")
        .data(chartData[0].dayStats)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => xScale(d.day))
        .attr("cy", d => yScale(d.averageCompletion))
        .attr("fill", d => d.isExcluded ? "#9ca3af" : "#1f2937")
        .attr("stroke", d => d.isExcluded ? "#6b7280" : "white")
        .attr("stroke-width", d => d.isExcluded ? 2 : 1)
        .style("cursor", "pointer")
        .on("mouseover", function(_event, d: DayData) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 5)
            .attr("stroke-width", d.isExcluded ? 3 : 2)
        })
        .on("mouseout", function(_event, d: DayData) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 3)
            .attr("stroke-width", d.isExcluded ? 2 : 1)
        })

      if (animate) {
        dots
          .attr("r", 0)
          .transition()
          .delay((_d, i) => i * 100)
          .duration(500)
          .attr("r", 3)
      } else {
        dots.attr("r", 3)
      }

      const legend = g.append("g")
        .attr("transform", `translate(${innerWidth - 150}, 20)`)

      legend.append("line")
        .attr("x1", 0)
        .attr("x2", 20)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "#1f2937")
        .attr("stroke-width", 3)

      legend.append("text")
        .attr("x", 25)
        .attr("y", 0)
        .attr("dy", "0.35em")
        .style("font-size", "12px")
        .text("Combined")

      chartData[0].sections.forEach((sectionNumber, i) => {
        const legendItem = legend.append("g")
          .attr("transform", `translate(0, ${(i + 1) * 20})`)

        legendItem.append("line")
          .attr("x1", 0)
          .attr("x2", 20)
          .attr("y1", 0)
          .attr("y2", 0)
          .attr("stroke", colorScale(sectionNumber))
          .attr("stroke-width", 2)

        legendItem.append("text")
          .attr("x", 25)
          .attr("y", 0)
          .attr("dy", "0.35em")
          .style("font-size", "12px")
          .text(`Section ${sectionNumber}`)
      })
    }

    // Defer initial draw so React Strict Mode's effect remount cancels the first
    // frame and we only animate once in development. Observe resize only after
    // the first draw so the observer's initial callback can't race it.
    let cancelled = false
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (cancelled || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const next = {
          w: Math.round(rect.width),
          h: Math.round(Math.min(rect.height || height, 400)),
        }
        const prev = lastSizeRef.current
        if (prev && prev.w === next.w && prev.h === next.h) return
        createChart(false)
      }, 150)
    })

    const frame = requestAnimationFrame(() => {
      if (cancelled || !containerRef.current) return
      const animate = lastDataKeyRef.current !== dataKey
      createChart(animate)
      lastDataKeyRef.current = dataKey
      resizeObserver.observe(containerRef.current)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      if (svgRef.current) {
        const svg = d3.select(svgRef.current)
        svg.interrupt()
        svg.selectAll("*").interrupt()
      }
    }
  }, [dataKey, width, height])

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[300px] flex items-center justify-center"
    >
      <svg
        ref={svgRef}
        className="w-full h-full"
      />
    </div>
  )
}
