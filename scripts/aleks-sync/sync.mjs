/**
 * Daily ALEKS Time and Topic downloader for GitHub Actions.
 *
 * Required env:
 *   ALEKS_USERNAME, ALEKS_PASSWORD
 *   APP_URL, IMPORT_API_TOKEN
 *
 * Exam period comes from the app (period containing today, else nearest past),
 * or EXAM_PERIOD env / workflow input override.
 * Classes are scraped from the ALEKS Class dropdown (active + archived).
 *
 * Optional:
 *   EXAM_PERIOD — force a specific period key
 *   FORCE_SYNC=1 — sync even if outside the period date window
 *   HEADED=1 — show browser
 *   DRY_RUN=1 — download but do not POST to the app
 *   DOWNLOAD_DIR — override download folder
 */

import { chromium } from "playwright"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  clickFirst,
  discoverClasses,
  ensureDownloadDir,
  fetchJson,
  login,
  requireEnv,
  screenshot,
  selectClass,
} from "./aleks-browser.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function fetchSyncConfig(appUrl, token, { period, force } = {}) {
  const params = new URLSearchParams()
  if (period) params.set("period", period)
  if (force) params.set("force", "1")
  const qs = params.toString()
  const endpoint = `/api/admin/aleks-sync/config${qs ? `?${qs}` : ""}`
  const base = appUrl.replace(/\/$/, "")
  let appHost = "(invalid APP_URL)"
  try {
    appHost = new URL(base).host
  } catch {
    /* keep placeholder */
  }
  console.log(`Sync config source host: ${appHost}`)
  console.log(`Sync config request path: ${endpoint}`)
  return fetchJson(appUrl, token, endpoint)
}

async function importReport(appUrl, token, { filePath, examPeriod, sectionNumber }) {
  const url = `${appUrl.replace(/\/$/, "")}/api/admin/aleks-sync/import`
  const bytes = await fs.readFile(filePath)
  const form = new FormData()
  form.append(
    "file",
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    path.basename(filePath),
  )
  form.append("examPeriod", examPeriod)
  form.append("sectionNumber", sectionNumber)

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Import failed for section ${sectionNumber} (${res.status}): ${body.error || res.statusText}`)
  }
  return body
}

async function openTimeAndTopic(page) {
  const reports = page.locator("#navigation_report").or(page.getByText(/^Reports$/i)).first()
  await reports.waitFor({ state: "visible", timeout: 20000 })
  await reports.hover().catch(() => {})
  await page.waitForTimeout(300)
  await reports.click().catch(() => {})
  await page.waitForTimeout(400)

  await clickFirst(page, [
    'text=/Time\\s*(and|&)\\s*Topic/i',
    'span:has-text("Time & Topic")',
    'a:has-text("Time and Topic")',
    'a:has-text("Time & Topic")',
    'text=/Time and Topic - Learning Mode/i',
  ])

  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

function isoToAleksParts(iso) {
  const [y, m, d] = iso.split("-").map(Number)
  return { year: String(y), month: String(m), day: String(d) }
}

async function readReportDateRange(page) {
  const body = await page.locator("body").innerText()
  const m = body.match(/Report from\s+(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/i)
  if (!m) return null
  const toIso = (mdy) => {
    const [mm, dd, yyyy] = mdy.split("/")
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
  }
  return { start: toIso(m[1]), end: toIso(m[2]), label: m[0] }
}

async function selectNumericOption(page, selectId, wanted) {
  const locator = page.locator(`#${selectId}`)
  await locator.waitFor({ state: "attached", timeout: 10000 })
  const options = await locator.evaluate((el) =>
    [...el.options].map((o) => ({ value: o.value, text: (o.textContent || "").trim() })),
  )
  const n = Number(wanted)
  const candidates = []
  for (const o of options) {
    if (o.value !== "" && Number(o.value) === n) candidates.push(o.value)
  }
  candidates.push(String(wanted), String(wanted).padStart(2, "0"))
  const monthNames = [
    "",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ]
  if (n >= 1 && n <= 12) {
    const name = monthNames[n]
    const byName = options.find((o) => o.text.toLowerCase().startsWith(name.slice(0, 3)))
    if (byName) candidates.push(byName.value)
  }

  const tried = new Set()
  for (const value of candidates) {
    if (value == null || tried.has(value)) continue
    tried.add(value)
    try {
      await locator.selectOption(value)
    } catch {
      try {
        await locator.selectOption({ label: value })
      } catch {
        continue
      }
    }
    const current = await locator.inputValue()
    if (Number(current) === n || current === value) return current
    if (monthNames[n] && String(current).toLowerCase().startsWith(monthNames[n].slice(0, 3))) {
      return current
    }
  }
  throw new Error(
    `Could not set #${selectId} to ${wanted}. Options: ${options.map((o) => o.value || o.text).join(",")}`,
  )
}

async function setAleksDateParts(page, prefix, iso) {
  const parts = isoToAleksParts(iso)
  await selectNumericOption(page, `${prefix}_date_day`, "1")
  await selectNumericOption(page, `${prefix}_date_year`, parts.year)
  await selectNumericOption(page, `${prefix}_date_month`, parts.month)
  await selectNumericOption(page, `${prefix}_date_day`, parts.day)
  await page.waitForTimeout(200)
}

async function setDateRangeAndCompute(page, startIso, endIso, downloadDir) {
  await page.locator("a").filter({ hasText: /^Change Date Range$/i }).first().click()
  await page.waitForSelector("#from_date_month", { state: "visible", timeout: 15000 })
  await page.waitForTimeout(300)

  await setAleksDateParts(page, "from", startIso)
  await setAleksDateParts(page, "to", endIso)
  await page.waitForTimeout(300)

  let hiddenFrom = await page.locator("#from_date").inputValue()
  let hiddenTo = await page.locator("#to_date").inputValue()
  console.log(`Date selects set → hidden fields ${hiddenFrom} → ${hiddenTo}`)

  if (hiddenFrom !== startIso || hiddenTo !== endIso) {
    await page.evaluate(
      ({ startIso, endIso }) => {
        const from = document.getElementById("from_date")
        const to = document.getElementById("to_date")
        if (from) from.value = startIso
        if (to) to.value = endIso
      },
      { startIso, endIso },
    )
    hiddenFrom = await page.locator("#from_date").inputValue()
    hiddenTo = await page.locator("#to_date").inputValue()
    console.log(`After hidden write → ${hiddenFrom} → ${hiddenTo}`)
  }

  if (hiddenFrom !== startIso || hiddenTo !== endIso) {
    const debug = await page.evaluate(() => {
      const dump = (id) => {
        const el = document.getElementById(id)
        if (!el) return null
        return {
          value: el.value,
          options: [...el.options].map((o) => `${o.value}:${(o.textContent || "").trim()}`),
        }
      }
      return {
        from_month: dump("from_date_month"),
        from_day: dump("from_date_day"),
        from_year: dump("from_date_year"),
        to_month: dump("to_date_month"),
        to_day: dump("to_date_day"),
        to_year: dump("to_date_year"),
        from_date: document.getElementById("from_date")?.value,
        to_date: document.getElementById("to_date")?.value,
      }
    })
    console.log("Date control debug:", JSON.stringify(debug, null, 2))
    await screenshot(page, downloadDir, "date-range-mismatch")
    throw new Error(`Date fields did not stick (got ${hiddenFrom}→${hiddenTo}, wanted ${startIso}→${endIso})`)
  }

  await page.getByRole("button", { name: /^Compute$/i }).click()
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await screenshot(page, downloadDir, "03-after-compute")

  const applied = await readReportDateRange(page)
  console.log(`Report range after compute: ${applied?.label || "(not found)"}`)
  if (!applied || applied.start !== startIso || applied.end !== endIso) {
    await screenshot(page, downloadDir, "date-range-not-applied")
    throw new Error(
      `Date range did not apply. Wanted ${startIso}→${endIso}, got ${applied?.start || "?"}→${applied?.end || "?"}`,
    )
  }
}

async function downloadExcel(page, downloadDir, sectionNumber) {
  await clickFirst(page, [
    'text=/Download\\s*Excel\\s*Spreadsheet/i',
    'a:has-text("Download Excel Spreadsheet")',
    'button:has-text("Download Excel Spreadsheet")',
    'text=/Download\\s*Excel/i',
  ])
  await page.waitForTimeout(800)

  const xlsxLink = page
    .locator("a")
    .filter({ hasText: /Excel\s*2007.*later|\.xlsx/i })
    .first()

  const safe = String(sectionNumber).replace(/\W+/g, "_")
  const target = path.join(downloadDir, `time-and-topic-section-${safe}.xlsx`)

  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      xlsxLink.click({ force: true, timeout: 15000 }),
    ])
    await download.saveAs(target)
    return target
  } catch (err) {
    const href = await xlsxLink.getAttribute("href").catch(() => null)
    if (!href) throw err
    const url = new URL(href, page.url()).toString()
    console.log(`Download click failed; fetching ${url.slice(0, 120)}…`)
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
    const res = await fetch(url, {
      headers: {
        Cookie: cookieHeader,
        Referer: page.url(),
      },
    })
    if (!res.ok) throw new Error(`Direct xlsx fetch failed (${res.status}): ${err.message}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(target, buf)
    return target
  }
}

async function main() {
  const username = requireEnv("ALEKS_USERNAME")
  const password = requireEnv("ALEKS_PASSWORD")
  const appUrl = requireEnv("APP_URL")
  const token = requireEnv("IMPORT_API_TOKEN")
  const periodOverride = (process.env.EXAM_PERIOD || "").trim()
  const forceSync = process.env.FORCE_SYNC === "1" || process.env.FORCE_SYNC === "true"
  const dryRun = process.env.DRY_RUN === "1"
  const headed = process.env.HEADED === "1"
  const downloadDir = process.env.DOWNLOAD_DIR || path.join(__dirname, ".downloads")

  await ensureDownloadDir(downloadDir)

  console.log(
    `Fetching sync config${periodOverride ? ` (period=${periodOverride})` : " (period by today's date)"}${forceSync ? " [FORCE]" : ""}…`,
  )
  const config = await fetchSyncConfig(appUrl, token, {
    period: periodOverride || undefined,
    force: forceSync,
  })
  const examPeriod = config.period?.key
  if (!examPeriod) throw new Error("Config did not return a period key")

  console.log(JSON.stringify({
    source: config.source,
    force: config.force,
    latestUploadAt: config.latestUploadAt,
    knownSections: config.knownSections,
    period: config.period,
    today: config.today,
    shouldSync: config.shouldSync,
    reason: config.reason,
    reportStartDate: config.reportStartDate,
    reportEndDate: config.reportEndDate,
  }, null, 2))

  if (!config.shouldSync) {
    console.log(`Skipping sync: ${config.reason}`)
    return
  }

  const browser = await chromium.launch({
    headless: !headed,
    downloadsPath: downloadDir,
  })
  const context = await browser.newContext({
    acceptDownloads: true,
  })
  const page = await context.newPage()

  const results = []
  try {
    console.log("Logging into ALEKS…")
    await login(page, username, password, downloadDir)
    await screenshot(page, downloadDir, "01-after-login")

    console.log("Discovering classes from ALEKS Class menu…")
    const classes = await discoverClasses(
      page,
      downloadDir,
      config.knownSections || [],
      examPeriod,
    )
    console.log(`Found ${classes.length} class(es):`)
    console.log(JSON.stringify(classes, null, 2))

    if (classes.length === 0) {
      throw new Error("No classes found in ALEKS Class dropdown")
    }

    let onTimeAndTopic = false

    for (const cls of classes) {
      console.log(`\n=== Class: ${cls.aleksName} → section ${cls.sectionNumber}${cls.archived ? " (archived)" : ""} ===`)
      try {
        await selectClass(page, cls, downloadDir)

        if (!onTimeAndTopic) {
          await openTimeAndTopic(page)
          await screenshot(page, downloadDir, "02-time-and-topic")
          console.log(`Setting date range ${config.reportStartDate} → ${config.reportEndDate}`)
          await setDateRangeAndCompute(page, config.reportStartDate, config.reportEndDate, downloadDir)
          onTimeAndTopic = true
        } else {
          await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {})
          await page.waitForTimeout(1500)
          const currentRange = await readReportDateRange(page)
          console.log(`After class switch: ${currentRange?.label || "(range not found)"}`)
          if (
            !currentRange ||
            currentRange.start !== config.reportStartDate ||
            currentRange.end !== config.reportEndDate
          ) {
            console.log("Date range reset after class switch — re-applying…")
            await setDateRangeAndCompute(page, config.reportStartDate, config.reportEndDate, downloadDir)
          }
        }

        console.log("Downloading Excel…")
        const filePath = await downloadExcel(page, downloadDir, cls.sectionNumber)
        const bytes = await fs.readFile(filePath)
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
          throw new Error(`Downloaded file is not Excel/ZIP (got magic ${bytes.slice(0, 4).toString("hex")})`)
        }
        console.log(`Saved ${filePath} (${bytes.length} bytes, valid xlsx signature)`)

        if (dryRun) {
          console.log("DRY_RUN=1 — skipping import")
          results.push({
            aleksName: cls.aleksName,
            sectionNumber: cls.sectionNumber,
            ok: true,
            dryRun: true,
            filePath,
          })
        } else {
          const imported = await importReport(appUrl, token, {
            filePath,
            examPeriod,
            sectionNumber: cls.sectionNumber,
          })
          console.log(`Imported: ${imported.studentCount} students`)
          results.push({
            aleksName: cls.aleksName,
            sectionNumber: cls.sectionNumber,
            ok: true,
            studentCount: imported.studentCount,
            fileBytes: bytes.length,
          })
        }
      } catch (err) {
        console.error(`Failed for ${cls.aleksName}:`, err.message)
        await screenshot(page, downloadDir, `error-${String(cls.sectionNumber).replace(/\W+/g, "_")}`)
        results.push({
          aleksName: cls.aleksName,
          sectionNumber: cls.sectionNumber,
          ok: false,
          error: err.message,
        })
      }
    }
  } finally {
    await browser.close()
  }

  console.log("\n=== Summary ===")
  console.log(JSON.stringify(results, null, 2))

  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
