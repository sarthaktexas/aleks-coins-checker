/**
 * Daily ALEKS Time and Topic downloader for GitHub Actions.
 *
 * Required env:
 *   ALEKS_USERNAME, ALEKS_PASSWORD
 *   APP_URL, IMPORT_API_TOKEN
 *
 * Exam period comes from the app (latest uploaded student_data period),
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CLASS_MENU_NOISE = new Set([
  "class",
  "classes",
  "archived",
  "archive",
  "active",
  "current",
  "select a class",
  "select class",
  "show archived",
  "hide archived",
  "view archived",
])

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

/** YYYY-MM-DD → M/D/YYYY (ALEKS date fields) */
function toAleksDate(iso) {
  const [y, m, d] = iso.split("-").map(Number)
  return `${m}/${d}/${y}`
}

/** Derive portal section number from an ALEKS class label. */
function sectionFromClassName(aleksName, knownSections = []) {
  const name = String(aleksName || "").trim()
  const secMatch = name.match(/(?:section|sec\.?)\s*[:#-]?\s*(\d{1,4})/i)
  if (secMatch) {
    const raw = secMatch[1]
    const padded = raw.padStart(3, "0")
    if (knownSections.includes(raw)) return raw
    if (knownSections.includes(padded)) return padded
    return knownSections.length ? (knownSections.includes(raw) ? raw : padded) : padded
  }

  const nums = [...name.matchAll(/\b(\d{2,4})\b/g)].map((m) => m[1])
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]
    const padded = n.padStart(3, "0")
    if (knownSections.includes(n)) return n
    if (knownSections.includes(padded)) return padded
  }
  if (nums.length > 0) {
    const n = nums[nums.length - 1]
    return n.length <= 3 ? n.padStart(3, "0") : n
  }

  // Last resort: slug (keeps sync working even without a numeric section)
  return name.replace(/\s+/g, "_").slice(0, 40)
}

async function fetchSyncConfig(appUrl, token, { period, force } = {}) {
  const params = new URLSearchParams()
  if (period) params.set("period", period)
  if (force) params.set("force", "1")
  const qs = params.toString()
  const url = `${appUrl.replace(/\/$/, "")}/api/admin/aleks-sync/config${qs ? `?${qs}` : ""}`
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

function normalizeClassLabel(text) {
  return String(text || "").replace(/\s+/g, " ").trim()
}

function isNoiseClassLabel(text) {
  const t = normalizeClassLabel(text).toLowerCase()
  if (!t || t.length < 2) return true
  if (CLASS_MENU_NOISE.has(t)) return true
  if (/^show\b|^hide\b|^view\b/i.test(t) && /archiv/i.test(t)) return true
  return false
}

async function collectVisibleClassLabels(page) {
  const labels = await page.evaluate(() => {
    const out = []
    const nodes = document.querySelectorAll(
      '[role="menuitem"], [role="option"], li, a, button, .class_name, .className, td',
    )
    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue
      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden") continue
      const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()
      if (!text || text.length > 120) continue
      // Prefer leaf-ish nodes (avoid giant containers)
      if (el.children.length > 3) continue
      out.push(text)
    }
    return out
  })

  const unique = []
  const seen = new Set()
  for (const raw of labels) {
    const text = normalizeClassLabel(raw)
    if (isNoiseClassLabel(text)) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(text)
  }
  return unique
}

async function toggleArchived(page, wantArchived) {
  const archivedControl = page.getByText(/archiv/i).first()
  if (!(await archivedControl.isVisible().catch(() => false))) return false
  const label = normalizeClassLabel(await archivedControl.innerText().catch(() => ""))
  const looksOpen = /hide|active classes|current/i.test(label)
  if (wantArchived && looksOpen) return true
  if (!wantArchived && !looksOpen && /show|view|archived/i.test(label)) {
    // already on active list
    return true
  }
  await archivedControl.click().catch(() => {})
  await page.waitForTimeout(600)
  return true
}

/**
 * Scrape Class dropdown: active classes, then archived classes.
 */
async function discoverClasses(page, downloadDir, knownSections = []) {
  await openClassDropdown(page)
  await page.waitForTimeout(800)

  const activeLabels = await collectVisibleClassLabels(page)
  await screenshot(page, downloadDir, "classes-active")

  let archivedLabels = []
  const hasArchived = await toggleArchived(page, true)
  if (hasArchived) {
    await page.waitForTimeout(500)
    archivedLabels = await collectVisibleClassLabels(page)
    await screenshot(page, downloadDir, "classes-archived")
    // return to active if possible
    await toggleArchived(page, false)
  }

  // Close dropdown (Escape)
  await page.keyboard.press("Escape").catch(() => {})
  await page.waitForTimeout(300)

  const classes = []
  const seen = new Set()

  for (const aleksName of activeLabels) {
    const key = aleksName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    classes.push({
      aleksName,
      sectionNumber: sectionFromClassName(aleksName, knownSections),
      archived: false,
    })
  }
  for (const aleksName of archivedLabels) {
    const key = aleksName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    classes.push({
      aleksName,
      sectionNumber: sectionFromClassName(aleksName, knownSections),
      archived: true,
    })
  }

  // Prefer classes that map to known portal sections when we have them
  if (knownSections.length > 0) {
    const matched = classes.filter((c) => knownSections.includes(c.sectionNumber))
    if (matched.length > 0) return matched
  }

  return classes
}

async function selectClass(page, { aleksName, archived }, downloadDir) {
  await openClassDropdown(page)
  await page.waitForTimeout(800)

  if (archived) {
    await toggleArchived(page, true)
  } else {
    await toggleArchived(page, false)
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

  const safe = String(sectionNumber).replace(/\W+/g, "_")
  const target = path.join(downloadDir, `time-and-topic-section-${safe}.xlsx`)
  await download.saveAs(target)
  return target
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

  await fs.mkdir(downloadDir, { recursive: true })

  console.log(
    `Fetching sync config${periodOverride ? ` (period=${periodOverride})` : " (active period from DB)"}${forceSync ? " [FORCE]" : ""}…`,
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
    await login(page, username, password)
    await screenshot(page, downloadDir, "01-after-login")

    console.log("Discovering classes from ALEKS Class menu…")
    const classes = await discoverClasses(page, downloadDir, config.knownSections || [])
    console.log(`Found ${classes.length} class(es):`)
    console.log(JSON.stringify(classes, null, 2))

    if (classes.length === 0) {
      throw new Error("No classes found in ALEKS Class dropdown")
    }

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
          await openTimeAndTopic(page)
          await page.waitForTimeout(1500)
        }

        console.log("Downloading Excel…")
        const filePath = await downloadExcel(page, downloadDir, cls.sectionNumber)
        console.log(`Saved ${filePath}`)

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
