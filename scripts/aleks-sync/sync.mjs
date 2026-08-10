/**
 * Daily ALEKS Time and Topic downloader for GitHub Actions.
 *
 * Required env:
 *   ALEKS_USERNAME, ALEKS_PASSWORD
 *   APP_URL, IMPORT_API_TOKEN
 *   EXAM_PERIOD
 *   ALEKS_CLASSES — JSON array:
 *     [{"aleksName":"Class display name","sectionNumber":"003","archived":false}]
 *
 * Optional:
 *   HEADED=1 — show browser
 *   DRY_RUN=1 — download but do not POST to the app
 *   DOWNLOAD_DIR — override download folder
 */

import { chromium } from "playwright"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

function parseClasses() {
  const raw = requireEnv("ALEKS_CLASSES")
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("ALEKS_CLASSES must be valid JSON")
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("ALEKS_CLASSES must be a non-empty JSON array")
  }
  return parsed.map((item, i) => {
    if (!item?.aleksName || !item?.sectionNumber) {
      throw new Error(`ALEKS_CLASSES[${i}] needs aleksName and sectionNumber`)
    }
    return {
      aleksName: String(item.aleksName),
      sectionNumber: String(item.sectionNumber),
      archived: Boolean(item.archived),
    }
  })
}

/** YYYY-MM-DD → M/D/YYYY (ALEKS date fields) */
function toAleksDate(iso) {
  const [y, m, d] = iso.split("-").map(Number)
  return `${m}/${d}/${y}`
}

async function fetchSyncConfig(appUrl, token, period) {
  const url = `${appUrl.replace(/\/$/, "")}/api/admin/aleks-sync/config?period=${encodeURIComponent(period)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Config fetch failed (${res.status}): ${body.error || res.statusText}`)
  }
  return body
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

async function screenshot(page, downloadDir, name) {
  try {
    await page.screenshot({ path: path.join(downloadDir, `${name}.png`), fullPage: true })
  } catch {
    /* ignore */
  }
}

async function clickFirst(page, selectors, { timeout = 15000 } = {}) {
  const errors = []
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).first()
      await loc.waitFor({ state: "visible", timeout: Math.min(timeout, 5000) })
      await loc.click({ timeout })
      return selector
    } catch (err) {
      errors.push(`${selector}: ${err.message}`)
    }
  }
  throw new Error(`Could not click any of:\n${errors.join("\n")}`)
}

async function fillFirst(page, selectors, value, { timeout = 10000 } = {}) {
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).first()
      await loc.waitFor({ state: "visible", timeout: Math.min(timeout, 4000) })
      await loc.fill("")
      await loc.fill(value)
      return selector
    } catch {
      /* try next */
    }
  }
  throw new Error(`Could not fill any of: ${selectors.join(", ")}`)
}

async function login(page, username, password) {
  await page.goto("https://www.aleks.com/", { waitUntil: "domcontentloaded", timeout: 60000 })

  // Registered Users box on homepage
  await fillFirst(page, [
    'input[name="login_name"]',
    'input[name="loginName"]',
    'input#login_name',
    'input[placeholder*="Login" i]',
    'input[aria-label*="Login" i]',
  ], username)

  await fillFirst(page, [
    'input[name="passwd"]',
    'input[name="password"]',
    'input[type="password"]',
  ], password)

  await clickFirst(page, [
    'input[type="submit"][value*="Login" i]',
    'button:has-text("Login")',
    'input[value="Login"]',
    'a:has-text("Login")',
  ])

  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {})
  // Wait until we are past the login form
  await page.waitForTimeout(2000)
}

async function openClassDropdown(page) {
  await clickFirst(page, [
    'text=/^Class$/i',
    '[aria-label*="Class" i]',
    'a:has-text("Class")',
    'button:has-text("Class")',
    '#class_selector',
    '.class-selector',
  ])
}

async function selectClass(page, { aleksName, archived }, downloadDir) {
  await openClassDropdown(page)
  await page.waitForTimeout(800)

  if (archived) {
    // Prefer archived list when testing / archived sections
    const archivedToggle = page.getByText(/archived/i).first()
    if (await archivedToggle.isVisible().catch(() => false)) {
      await archivedToggle.click().catch(() => {})
      await page.waitForTimeout(500)
    }
  }

  const classOption = page.getByText(aleksName, { exact: false }).first()
  try {
    await classOption.waitFor({ state: "visible", timeout: 10000 })
    await classOption.click()
  } catch (err) {
    await screenshot(page, downloadDir, `class-not-found-${aleksName.replace(/\W+/g, "_")}`)
    throw new Error(`Could not select class "${aleksName}": ${err.message}`)
  }

  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function openTimeAndTopic(page) {
  // Hover Reports, then Time and Topic
  const reports = page.getByText(/^Reports$/i).first()
  await reports.waitFor({ state: "visible", timeout: 20000 })
  await reports.hover()
  await page.waitForTimeout(400)

  await clickFirst(page, [
    'text=/Time\\s*(and|&)\\s*Topic/i',
    'a:has-text("Time and Topic")',
    'a:has-text("Time & Topic")',
  ])

  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function setDateRangeAndCompute(page, startIso, endIso, downloadDir) {
  await clickFirst(page, [
    'text=/Change\\s*Date\\s*Range/i',
    'a:has-text("Change Date Range")',
    'button:has-text("Change Date Range")',
  ])
  await page.waitForTimeout(800)

  const start = toAleksDate(startIso)
  const end = toAleksDate(endIso)

  // Common ALEKS field patterns; fall back to first two date-looking inputs
  try {
    await fillFirst(page, [
      'input[name*="start" i]',
      'input[id*="start" i]',
      'input[aria-label*="Start" i]',
      'label:has-text("Start") + input',
      'label:has-text("From") + input',
    ], start)
    await fillFirst(page, [
      'input[name*="end" i]',
      'input[id*="end" i]',
      'input[aria-label*="End" i]',
      'label:has-text("End") + input',
      'label:has-text("To") + input',
    ], end)
  } catch {
    const dateInputs = page.locator('input[type="text"], input:not([type])')
    const count = await dateInputs.count()
    if (count < 2) {
      await screenshot(page, downloadDir, "date-range-inputs-missing")
      throw new Error("Could not find start/end date inputs")
    }
    await dateInputs.nth(0).fill(start)
    await dateInputs.nth(1).fill(end)
  }

  await clickFirst(page, [
    'text=/^Compute$/i',
    'button:has-text("Compute")',
    'input[value="Compute"]',
    'a:has-text("Compute")',
  ])

  await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {})
  await page.waitForTimeout(2000)
}

async function downloadExcel(page, downloadDir, sectionNumber) {
  // Open download menu
  await clickFirst(page, [
    'text=/Download\\s*Excel\\s*Spreadsheet/i',
    'a:has-text("Download Excel Spreadsheet")',
    'button:has-text("Download Excel Spreadsheet")',
    'text=/Download\\s*Excel/i',
  ])
  await page.waitForTimeout(500)

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    clickFirst(page, [
      'text=/Excel\\s*2007\\s*or\\s*later/i',
      'a:has-text("Excel 2007 or later")',
      'text=/\\.xlsx/i',
      'a:has-text("Excel 2007")',
    ]),
  ])

  const target = path.join(downloadDir, `time-and-topic-section-${sectionNumber}.xlsx`)
  await download.saveAs(target)
  return target
}

async function main() {
  const username = requireEnv("ALEKS_USERNAME")
  const password = requireEnv("ALEKS_PASSWORD")
  const appUrl = requireEnv("APP_URL")
  const token = requireEnv("IMPORT_API_TOKEN")
  const examPeriod = requireEnv("EXAM_PERIOD")
  const classes = parseClasses()
  const dryRun = process.env.DRY_RUN === "1"
  const headed = process.env.HEADED === "1"
  const downloadDir = process.env.DOWNLOAD_DIR || path.join(__dirname, ".downloads")

  await fs.mkdir(downloadDir, { recursive: true })

  console.log(`Fetching sync config for period=${examPeriod}…`)
  const config = await fetchSyncConfig(appUrl, token, examPeriod)
  console.log(JSON.stringify({
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
    await login(page, username, password)
    await screenshot(page, downloadDir, "01-after-login")

    let dateRangeSet = false

    for (const cls of classes) {
      console.log(`\n=== Class: ${cls.aleksName} → section ${cls.sectionNumber}${cls.archived ? " (archived)" : ""} ===`)
      try {
        await selectClass(page, cls, downloadDir)

        if (!dateRangeSet) {
          await openTimeAndTopic(page)
          await screenshot(page, downloadDir, "02-time-and-topic")
          console.log(`Setting date range ${config.reportStartDate} → ${config.reportEndDate}`)
          await setDateRangeAndCompute(page, config.reportStartDate, config.reportEndDate, downloadDir)
          dateRangeSet = true
        } else {
          // Date range persists; open report for the newly selected class
          await openTimeAndTopic(page)
          await page.waitForTimeout(1500)
        }

        console.log("Downloading Excel…")
        const filePath = await downloadExcel(page, downloadDir, cls.sectionNumber)
        console.log(`Saved ${filePath}`)

        if (dryRun) {
          console.log("DRY_RUN=1 — skipping import")
          results.push({ sectionNumber: cls.sectionNumber, ok: true, dryRun: true, filePath })
        } else {
          const imported = await importReport(appUrl, token, {
            filePath,
            examPeriod,
            sectionNumber: cls.sectionNumber,
          })
          console.log(`Imported: ${imported.studentCount} students`)
          results.push({
            sectionNumber: cls.sectionNumber,
            ok: true,
            studentCount: imported.studentCount,
          })
        }
      } catch (err) {
        console.error(`Failed for ${cls.aleksName}:`, err.message)
        await screenshot(page, downloadDir, `error-${cls.sectionNumber}`)
        results.push({ sectionNumber: cls.sectionNumber, ok: false, error: err.message })
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
