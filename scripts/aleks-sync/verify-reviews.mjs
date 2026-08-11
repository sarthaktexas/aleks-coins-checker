/**
 * Daily ALEKS timeline verifier for reviewed-topics override requests.
 *
 * Required env:
 *   ALEKS_USERNAME, ALEKS_PASSWORD
 *   APP_URL, IMPORT_API_TOKEN
 *
 * Optional:
 *   HEADED=1 — show browser
 *   DRY_RUN=1 — scrape but do not POST results
 *   DOWNLOAD_DIR — override screenshot folder
 */

import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  clickFirst,
  discoverClasses,
  ensureDownloadDir,
  escapeRegExp,
  fetchJson,
  login,
  requireEnv,
  screenshot,
  selectClass,
} from "./aleks-browser.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function nameTokens(name) {
  return normalizeName(name).split(/\s+/).filter(Boolean)
}

function namesLikelyMatch(a, b) {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  if (normalizeName(a) === normalizeName(b)) return true

  // "Last, First" vs "First Last"
  const aJoined = ta.join(" ")
  const bJoined = tb.join(" ")
  if (aJoined.includes(bJoined) || bJoined.includes(aJoined)) return true

  const overlap = ta.filter((t) => tb.includes(t))
  return overlap.length >= Math.min(2, Math.min(ta.length, tb.length))
}

function parseIsoParts(iso) {
  const [y, m, d] = String(iso).split("-").map(Number)
  return { year: y, month: m, day: d }
}

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] // Sun..Sat

function weekdayLetterForIso(iso) {
  const { year, month, day } = parseIsoParts(iso)
  const dt = new Date(year, month - 1, day)
  return WEEKDAY_LETTERS[dt.getDay()]
}

async function openStudentDropdown(page) {
  // After a class is selected, ALEKS shows a Student searchbar (often searchbar_2).
  const candidates = [
    "#sim_nav_sel_searchbar_2",
    "#sim_nav_sel_searchbar_3",
    '[id^="sim_nav_sel_searchbar_"]:not(#sim_nav_sel_searchbar_1)',
  ]

  for (const root of candidates) {
    const bar = page.locator(root).first()
    if (!(await bar.count())) continue
    const list = bar.locator(".scroll_divSB, .tableSB")
    if (!(await list.first().isVisible().catch(() => false))) {
      await bar.locator(".pulldownSB, [id$='_selected'], [id$='_button']").first().click({ force: true }).catch(async () => {
        await bar.click({ force: true })
      })
      await page.waitForTimeout(400)
    }
    return root
  }

  await clickFirst(page, [
    'text=/^Student$/i',
    '[aria-label*="Student" i]',
    'a:has-text("Student")',
    'button:has-text("Student")',
    '#student_selector',
    '.student-selector',
  ])
  return "text-student"
}

async function selectStudent(page, studentName, downloadDir, tag) {
  const root = await openStudentDropdown(page)
  await page.waitForTimeout(300)

  const entries = await page.evaluate((rootSel) => {
    const scope = rootSel.startsWith("#")
      ? document.querySelector(rootSel) || document
      : document
    const nodes = scope.querySelectorAll(".sim_sb_entry_tag_left, .listed_elementSB td, [role='option']")
    const out = []
    for (const el of nodes) {
      const name = (el.textContent || "").replace(/\s+/g, " ").trim()
      if (!name || /select a student|all students|^student$/i.test(name)) continue
      out.push(name)
    }
    return out
  }, root)

  const match = entries.find((n) => namesLikelyMatch(n, studentName))
  if (!match) {
    await screenshot(page, downloadDir, `student-not-found-${tag}`)
    throw new Error(
      `Student "${studentName}" not found in dropdown (saw ${entries.length} entries)`,
    )
  }

  const option = page
    .locator(`${root} .sim_sb_entry_tag_left, ${root} .listed_elementSB .sim_sb_entry_tag_left, .sim_sb_entry_tag_left`)
    .filter({ hasText: new RegExp(escapeRegExp(match)) })
    .first()

  await option.click({ force: true, timeout: 10000 })
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
  return match
}

async function openTimeline(page) {
  // Prefer Reports → Timeline for instructor student view; also try direct Timeline tabs.
  const reports = page.locator("#navigation_report").or(page.getByText(/^Reports$/i)).first()
  if (await reports.isVisible().catch(() => false)) {
    await reports.hover().catch(() => {})
    await page.waitForTimeout(250)
    await reports.click().catch(() => {})
    await page.waitForTimeout(400)
  }

  await clickFirst(page, [
    'text=/^Timeline$/i',
    'a:has-text("Timeline")',
    'button:has-text("Timeline")',
    'span:has-text("Timeline")',
    '[aria-label*="Timeline" i]',
    'text=/Timeline Detail/i',
  ])

  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function ensureMonthView(page) {
  const monthBtn = page.getByRole("button", { name: /^Month$/i }).or(page.locator("button, a, span").filter({ hasText: /^Month$/i }))
  if (await monthBtn.first().isVisible().catch(() => false)) {
    await monthBtn.first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)
  }
}

/** Parse "August 1 - 31 2026" / "July 1 - 31 2026" style header from Timeline Detail. */
async function readTimelineMonthRange(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || ""
    const m = text.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\d{4})\b/i,
    )
    if (!m) return null
    const months = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    }
    const month = months[m[1].toLowerCase()]
    return {
      label: m[0],
      month,
      startDay: Number(m[2]),
      endDay: Number(m[3]),
      year: Number(m[4]),
    }
  })
}

async function clickTimelineNav(page, direction) {
  // Timeline Detail: circular range arrows under the chart.
  // Prev is #lightBulbTarget_rangeArrow; next is the sibling button to its right.
  const prev = page.locator("#lightBulbTarget_rangeArrow")
  const next = page.locator("#lightBulbTarget_rangeArrow + button, button#lightBulbTarget_rangeArrow ~ button").first()

  const target = direction === "prev" ? prev : next
  if (await target.count()) {
    await target.scrollIntoViewIfNeeded().catch(() => {})
    await target.click({ force: true, timeout: 5000 }).catch(async () => {
      await target.evaluate((el) => el.click())
    })
    await page.waitForTimeout(1000)
    return true
  }

  // Fallback: any pair of empty circular buttons near the bottom with SVG chevrons
  const clicked = await page.evaluate((dir) => {
    const buttons = [...document.querySelectorAll("button")].filter((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width >= 40 && rect.width <= 80 && rect.height >= 24 && rect.height <= 50 && el.querySelector("svg")
    })
    if (buttons.length < 2) return false
    buttons.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y || a.getBoundingClientRect().x - b.getBoundingClientRect().x)
    // Prefer the lowest pair
    const lastTwo = buttons.slice(-2).sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
    const el = dir === "prev" ? lastTwo[0] : lastTwo[1]
    el?.scrollIntoView({ block: "center" })
    el?.click()
    return Boolean(el)
  }, direction)

  if (clicked) {
    await page.waitForTimeout(1000)
    return true
  }
  return false
}

async function timelineShowsDay(page, iso) {
  const { day, month, year } = parseIsoParts(iso)
  const monthShort = new Date(year, month - 1, 1)
    .toLocaleString("en-US", { month: "short" })
  const monthLong = new Date(year, month - 1, 1)
    .toLocaleString("en-US", { month: "long" })

  const range = await readTimelineMonthRange(page)
  if (range && range.year === year && range.month === month) {
    // Month view for the right month is enough — day markers may not label every day.
    return true
  }

  return page.evaluate(
    ({ day, monthShort, monthLong, iso }) => {
      const text = (document.body.innerText || "").toLowerCase()
      if (text.includes(iso.toLowerCase())) return true
      const short = monthShort.toLowerCase()
      const long = monthLong.toLowerCase()
      if (text.includes(`${short} ${day}`) || text.includes(`${long} ${day}`)) return true
      // Monday labels like "Jul 6" near the target week
      for (let d = Math.max(1, day - 6); d <= day + 6; d++) {
        if (text.includes(`${short} ${d}`)) return true
      }
      return false
    },
    { day, monthShort, monthLong, iso },
  )
}

async function navigateTimelineToDate(page, iso, downloadDir, tag) {
  await ensureMonthView(page)
  await screenshot(page, downloadDir, `timeline-start-${tag}`)

  if (await timelineShowsDay(page, iso)) return true

  const target = parseIsoParts(iso)
  // Prefer scrolling toward the target month using the range header.
  for (let i = 0; i < 18; i++) {
    const range = await readTimelineMonthRange(page)
    let direction = "prev"
    if (range) {
      const currentIdx = range.year * 12 + range.month
      const targetIdx = target.year * 12 + target.month
      if (currentIdx === targetIdx) {
        if (await timelineShowsDay(page, iso)) return true
        break
      }
      direction = currentIdx > targetIdx ? "prev" : "next"
      console.log(`  Timeline at ${range.label} → click ${direction} (want ${iso})`)
    } else {
      console.log(`  Timeline month header not found → click ${direction}`)
    }

    const before = range?.label || ""
    const moved = await clickTimelineNav(page, direction)
    if (!moved) {
      console.log("  Timeline nav button not found")
      break
    }
    const after = await readTimelineMonthRange(page)
    if ((after?.label || "") === before) {
      console.log("  Timeline did not change after nav click — trying opposite once")
      await clickTimelineNav(page, direction === "prev" ? "next" : "prev")
    }
    if (await timelineShowsDay(page, iso)) return true
  }

  await screenshot(page, downloadDir, `timeline-date-missing-${tag}`)
  return false
}

async function readReviewedTopicsForDay(page, iso, downloadDir, tag) {
  const { day, month, year } = parseIsoParts(iso)
  const monthShort = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short" })

  // Estimate the target day's x-position from Monday week labels like "Jul 6".
  const targetX = await page.evaluate(
    ({ day, monthShort }) => {
      const labels = [...document.querySelectorAll("text, span, div, tspan")]
      const mondayMarks = []
      for (const el of labels) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim()
        const m = t.match(new RegExp(`^${monthShort}\\s+(\\d{1,2})$`, "i"))
        if (!m) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.y < 300) continue
        mondayMarks.push({ day: Number(m[1]), x: r.x + r.width / 2 })
      }
      mondayMarks.sort((a, b) => a.day - b.day)
      if (mondayMarks.length === 0) return null

      // Find surrounding Monday labels and interpolate.
      let left = mondayMarks[0]
      let right = mondayMarks[mondayMarks.length - 1]
      for (let i = 0; i < mondayMarks.length; i++) {
        if (mondayMarks[i].day <= day) left = mondayMarks[i]
        if (mondayMarks[i].day >= day) {
          right = mondayMarks[i]
          break
        }
      }
      if (left.day === right.day) return left.x
      const ratio = (day - left.day) / (right.day - left.day)
      return left.x + ratio * (right.x - left.x)
    },
    { day, monthShort },
  )

  const parseReviewed = (text) => {
    if (!text) return null
    const m =
      text.match(/Reviewed Topics\s+(\d+)/i) ||
      text.match(/(\d+)\s+topics?\s+reviewed/i) ||
      text.match(/reviewed\s+(\d+)\s+topics?/i)
    return m ? Number(m[1]) : null
  }

  const readPopupText = async () =>
    page.evaluate(() => {
      const bits = []
      for (const el of document.querySelectorAll(
        "title, .highcharts-tooltip, [class*='tooltip' i], [class*='Tooltip'], foreignObject, [role='dialog'], .popup, .popover, .balloon",
      )) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim()
        if (t) bits.push(t)
      }
      for (const el of document.querySelectorAll("div")) {
        const s = getComputedStyle(el)
        if (s.position !== "absolute" && s.position !== "fixed") continue
        const r = el.getBoundingClientRect()
        if (r.width < 60 || r.height < 20 || r.bottom < 0 || r.top > innerHeight) continue
        const t = (el.innerText || "").replace(/\s+/g, " ").trim()
        if (t && t.length < 500 && /topic|review|learn|master/i.test(t)) bits.push(t)
      }
      return [...new Set(bits)].join("\n")
    })

  // Chart markers: icon_plus sits under activity nodes; tooltips include "Reviewed Topics N".
  const images = page.locator("svg image")
  const n = await images.count()
  const candidates = []
  for (let i = 0; i < n; i++) {
    const el = images.nth(i)
    const href =
      (await el.getAttribute("href").catch(() => null)) ||
      (await el.getAttribute("xlink:href").catch(() => null)) ||
      ""
    const box = await el.boundingBox().catch(() => null)
    if (!box || box.width < 8 || box.y > 700) continue
    const name = href.split("/").pop() || ""
    if (!/icon_plus|module|knowledge_check/i.test(name)) continue
    const dist = targetX == null ? 0 : Math.abs(box.x + box.width / 2 - targetX)
    candidates.push({ i, el, name, box, dist, isPlus: /icon_plus/i.test(name) })
  }

  // Prefer icon_plus near the target day, then other chart markers near that x.
  candidates.sort((a, b) => {
    if (a.isPlus !== b.isPlus) return a.isPlus ? -1 : 1
    return a.dist - b.dist
  })

  let foundCheckmark = candidates.some((c) => c.isPlus)
  let best = null

  for (const c of candidates.slice(0, 12)) {
    await c.el.click({ force: true }).catch(() => {})
    await page.waitForTimeout(700)
    const popupText = await readPopupText()
    const reviewedTopics = parseReviewed(popupText)
    console.log(
      `  marker ${c.name} @x=${Math.round(c.box.x)} dist=${Math.round(c.dist)} → reviewed=${reviewedTopics}`,
    )
    if (reviewedTopics != null) {
      // Keep the closest match to the target day that mentions reviews.
      if (!best || c.dist < best.dist) {
        best = { reviewedTopics, popupText, dist: c.dist, foundCheckmark: true }
      }
      // Exact-ish day hit
      if (c.dist < 40) {
        await screenshot(page, downloadDir, `review-popup-${tag}`)
        return {
          foundCheckmark: true,
          reviewedTopics,
          popupText: popupText.slice(0, 500),
        }
      }
    }
  }

  if (best) {
    await screenshot(page, downloadDir, `review-popup-${tag}`)
    return {
      foundCheckmark: true,
      reviewedTopics: best.reviewedTopics,
      popupText: (best.popupText || "").slice(0, 500),
    }
  }

  const bodyText = await page.locator("body").innerText().catch(() => "")
  const bodyReviewed = parseReviewed(bodyText)
  await screenshot(page, downloadDir, `review-scan-${tag}`)

  return {
    foundCheckmark,
    reviewedTopics: bodyReviewed != null ? bodyReviewed : foundCheckmark ? null : 0,
    popupText: bodyReviewed != null ? `Reviewed Topics ${bodyReviewed}` : null,
  }
}

function sectionAliases(section) {
  const s = String(section || "").trim()
  if (!s) return []
  const digits = s.replace(/\D/g, "")
  const out = new Set([s])
  if (digits) {
    out.add(digits)
    out.add(digits.padStart(3, "0"))
    out.add(digits.replace(/^0+/, "") || "0")
  }
  return [...out]
}

function classMatchesSection(cls, sectionNumber) {
  const aliases = new Set(sectionAliases(sectionNumber))
  return aliases.has(String(cls.sectionNumber)) || aliases.has(String(cls.sectionNumber).replace(/^0+/, "") || "0")
}

async function main() {
  const username = requireEnv("ALEKS_USERNAME")
  const password = requireEnv("ALEKS_PASSWORD")
  const appUrl = requireEnv("APP_URL")
  const token = requireEnv("IMPORT_API_TOKEN")
  const dryRun = process.env.DRY_RUN === "1"
  const headed = process.env.HEADED === "1"
  const downloadDir = process.env.DOWNLOAD_DIR || path.join(__dirname, ".downloads-reviews")

  await ensureDownloadDir(downloadDir)

  console.log("Fetching pending reviewed-topics overrides…")
  const payload = await fetchJson(appUrl, token, "/api/admin/aleks-sync/review-overrides")
  const requests = payload.requests || []
  console.log(`Found ${requests.length} pending review override(s)`)

  if (requests.length === 0) {
    console.log("Nothing to verify.")
    return
  }

  // Group by section so we switch classes sparingly
  const bySection = new Map()
  for (const req of requests) {
    const key = String(req.sectionNumber || "default")
    if (!bySection.has(key)) bySection.set(key, [])
    bySection.get(key).push(req)
  }

  const browser = await chromium.launch({
    headless: !headed,
    downloadsPath: downloadDir,
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  const results = []
  try {
    console.log("Logging into ALEKS…")
    await login(page, username, password, downloadDir)
    await screenshot(page, downloadDir, "01-after-login")

    const periodKey = requests[0]?.period || ""
    const knownSections = [...bySection.keys()]
    const classes = await discoverClasses(page, downloadDir, knownSections, periodKey)
    console.log(`Discovered ${classes.length} class(es)`)

    for (const [section, sectionRequests] of bySection) {
      const cls = classes.find((c) => classMatchesSection(c, section))
      if (!cls) {
        console.error(`No ALEKS class for section ${section}`)
        for (const req of sectionRequests) {
          results.push({
            requestId: req.id,
            reviewedTopics: null,
            foundDate: false,
            foundCheckmark: false,
            minutes: req.minutes,
            error: `No ALEKS class matched section ${section}`,
          })
        }
        continue
      }

      console.log(`\n=== Section ${section}: ${cls.aleksName} (${sectionRequests.length} request(s)) ===`)
      await selectClass(page, cls, downloadDir)

      for (const req of sectionRequests) {
        const tag = `${req.id}-${String(req.studentName || "").replace(/\W+/g, "_").slice(0, 24)}`
        console.log(
          `Verifying request #${req.id}: ${req.studentName} @ ${req.overrideDate} (day ${req.dayNumber}, ${req.minutes} min)`,
        )

        try {
          await selectStudent(page, req.studentName, downloadDir, tag)
          await openTimeline(page)
          await screenshot(page, downloadDir, `timeline-${tag}`)

          const foundDate = await navigateTimelineToDate(page, req.overrideDate, downloadDir, tag)
          if (!foundDate) {
            results.push({
              requestId: req.id,
              reviewedTopics: null,
              foundDate: false,
              foundCheckmark: false,
              minutes: req.minutes,
              notes: "Could not find override date on timeline",
            })
            continue
          }

          const review = await readReviewedTopicsForDay(page, req.overrideDate, downloadDir, tag)
          console.log(
            `  → date ok, checkmark=${review.foundCheckmark}, reviewedTopics=${review.reviewedTopics}`,
          )

          results.push({
            requestId: req.id,
            reviewedTopics: review.reviewedTopics,
            foundDate: true,
            foundCheckmark: review.foundCheckmark,
            minutes: req.minutes,
            notes: review.popupText || undefined,
          })
        } catch (err) {
          console.error(`  Failed: ${err.message}`)
          await screenshot(page, downloadDir, `error-${tag}`)
          results.push({
            requestId: req.id,
            reviewedTopics: null,
            foundDate: false,
            foundCheckmark: false,
            minutes: req.minutes,
            error: err.message,
          })
        }
      }
    }
  } finally {
    await browser.close()
  }

  console.log("\n=== Verification results ===")
  console.log(JSON.stringify(results, null, 2))

  if (dryRun) {
    console.log("DRY_RUN=1 — skipping POST of results")
    return
  }

  const applied = await fetchJson(appUrl, token, "/api/admin/aleks-sync/review-overrides", {
    method: "POST",
    body: { results },
  })
  console.log("Applied:", JSON.stringify(applied, null, 2))

  // Soft-fail if every request errored hard
  const hardFails = results.filter((r) => r.error)
  if (hardFails.length === results.length && results.length > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
