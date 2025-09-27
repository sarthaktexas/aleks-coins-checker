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

  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current) return

    const createChart = () => {
      const svg = d3.select(svgRef.current)
      svg.selectAll("*").remove() // Clear previous chart

      // Get container dimensions
      const containerRect = containerRef.current!.getBoundingClientRect()
      const containerWidth = containerRect.width || width
      const containerHeight = Math.min(containerRect.height || height, 400) // Max height of 400px

      // Update SVG dimensions to fit container
      svg.attr("width", containerWidth).attr("height", containerHeight)

      const margin = { top: 20, right: 80, bottom: 110, left: 60 }
      const innerWidth = containerWidth - margin.left - margin.right
      const innerHeight = containerHeight - margin.top - margin.bottom

      // Create scales
      const xScale = d3.scaleLinear()
        .domain(d3.extent(data[0].dayStats, d => d.day) as [number, number])
        .range([0, innerWidth])

      const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([innerHeight, 0])

      // Create line generator
      const line = d3.line<DayData>()
        .x(d => xScale(d.day))
        .y(d => yScale(d.averageCompletion))
        .curve(d3.curveMonotoneX)

      // Create section line generators
      const sectionLine = (sectionNumber: string) => d3.line<DayData>()
        .x(d => xScale(d.day))
        .y(d => {
          const sectionData = d.sectionData.find(s => s.sectionNumber === sectionNumber)
          return yScale(sectionData?.completion || 0)
        })
        .curve(d3.curveMonotoneX)

      // Create main group
      const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`)

      // Add grid lines
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

      // Add primary x-axis (Day numbers)
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale))

      // Add secondary x-axis (Days of week)
      const dayOfWeekScale = d3.scaleLinear()
        .domain(d3.extent(data[0].dayStats, d => d.day) as [number, number])
        .range([0, innerWidth])

      // Create day of week labels
      const dayLabels = data[0].dayStats.map(d => {
        // Parse date manually to avoid timezone issues
        const [year, month, day] = d.date.split('-').map(Number)
        const date = new Date(year, month - 1, day) // Manual parsing (month is 0-indexed)
        const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.
        const dayNames = ['S', 'M', 'T', 'W', 'R', 'F', 'S'] // Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
        
        return {
          day: d.day,
          dayOfWeek: dayNames[dayOfWeek],
          x: dayOfWeekScale(d.day)
        }
      })

      // Add secondary x-axis for days of week
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

      // Add "Day" label below the days of week
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

      // Color scale for sections
      const colorScale = d3.scaleOrdinal<string, string>()
        .domain(data[0].sections)
        .range(["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"])

      // Draw section lines with animation
      data[0].sections.forEach(sectionNumber => {
        const path = g.append("path")
          .datum(data[0].dayStats)
          .attr("fill", "none")
          .attr("stroke", colorScale(sectionNumber))
          .attr("stroke-width", 2)
          .style("opacity", 0.8)
          .attr("d", sectionLine(sectionNumber)) // Set the path data first

        // Animate the line drawing
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
      })

      // Draw combined line with animation
      const combinedPath = g.append("path")
        .datum(data[0].dayStats)
        .attr("fill", "none")
        .attr("stroke", "#1f2937")
        .attr("stroke-width", 3)
        .style("opacity", 1)
        .attr("d", line) // Set the path data first

      // Animate the combined line drawing
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

      // Add dots for data points with animation
      g.selectAll(".dot")
        .data(data[0].dayStats)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => xScale(d.day))
        .attr("cy", d => yScale(d.averageCompletion))
        .attr("r", 0) // Start with radius 0
        .attr("fill", d => d.isExcluded ? "#9ca3af" : "#1f2937") // Gray for exempt days, dark for regular
        .attr("stroke", d => d.isExcluded ? "#6b7280" : "white") // Darker gray border for exempt days
        .attr("stroke-width", d => d.isExcluded ? 2 : 1) // Thicker border for exempt days
        .style("cursor", "pointer")
        .on("mouseover", function(event, d: DayData) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 5)
            .attr("stroke-width", d.isExcluded ? 3 : 2)
        })
        .on("mouseout", function(event, d: DayData) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 3)
            .attr("stroke-width", d.isExcluded ? 2 : 1)
        })
        .transition()
        .delay((d, i) => i * 100) // Stagger the animation
        .duration(500)
        .attr("r", 3)

      // Add legend
      const legend = g.append("g")
        .attr("transform", `translate(${innerWidth - 150}, 20)`)

      // Combined line legend
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

      // Section legends
      data[0].sections.forEach((sectionNumber, i) => {
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

    // Create initial chart
    createChart()

    // Add resize observer
    const resizeObserver = new ResizeObserver(() => {
      createChart()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [data, width, height])

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