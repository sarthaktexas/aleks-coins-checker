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

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

/** Derive portal section number from an ALEKS class label. */
function sectionFromClassName(aleksName, knownSections = []) {
  const name = String(aleksName || "").trim()
  const candidates = []

  // Common ALEKS pattern: "... - 01T" / "... - 006"
  const trail = name.match(/-\s*([A-Za-z0-9]+)\s*$/)
  if (trail) {
    const raw = trail[1]
    candidates.push(raw)
    const digits = raw.replace(/\D/g, "")
    if (digits) {
      candidates.push(digits)
      const unpadded = digits.replace(/^0+/, "") || "0"
      candidates.push(unpadded)
      candidates.push(digits.padStart(3, "0"))
    }
  }

  const secMatch = name.match(/(?:section|sec\.?)\s*[:#-]?\s*(\d{1,4})/i)
  if (secMatch) {
    candidates.push(secMatch[1], secMatch[1].padStart(3, "0"))
  }

  for (const n of [...name.matchAll(/\b(\d{2,4})\b/g)].map((m) => m[1]).reverse()) {
    candidates.push(n, n.padStart(3, "0"), n.replace(/^0+/, "") || "0")
  }

  const uniq = [...new Set(candidates.filter(Boolean))]
  for (const c of uniq) {
    if (knownSections.includes(c)) return c
  }
  if (uniq.length > 0) {
    // Prefer bare numeric section when no known match
    const bare = uniq.find((c) => /^\d+$/.test(c) && !/^0\d/.test(c)) || uniq[0]
    return bare
  }

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

async function login(page, username, password, downloadDir) {
  await page.goto("https://www.aleks.com/", { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(1500)

  // Cookie banner can sit on top of the form in CI
  const cookieClose = page.getByRole("link", { name: /close cookie banner/i })
  if (await cookieClose.isVisible().catch(() => false)) {
    await cookieClose.click().catch(() => {})
    await page.waitForTimeout(300)
  }

  try {
    await page.locator("#login_name_full, input[name='username']").first().waitFor({
      state: "visible",
      timeout: 20000,
    })

    await fillFirst(page, [
      "#login_name_full",
      'input[name="username"]',
      'input[name="login_name"]',
      'input[name="loginName"]',
      "input#login_name",
      'input[placeholder*="Login" i]',
      'input[aria-label*="Login" i]',
    ], username)

    await fillFirst(page, [
      "#login_pass_full",
      'input[name="password"]',
      'input[name="passwd"]',
      'input[type="password"]',
    ], password)

    await clickFirst(page, [
      "#login_button_0",
      'button:has-text("LOG IN")',
      'button:has-text("Log In")',
      'button[type="submit"]',
      'input[type="submit"][value*="Login" i]',
      'input[value="Login"]',
    ])
  } catch (err) {
    if (downloadDir) await screenshot(page, downloadDir, "00-login-failed")
    throw err
  }

  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // Sanity check: username field should be gone after a successful login
  const stillOnLogin = await page.locator("#login_name_full").isVisible().catch(() => false)
  if (stillOnLogin) {
    if (downloadDir) await screenshot(page, downloadDir, "00-login-still-on-form")
    throw new Error("ALEKS login did not navigate away from the login form (check credentials)")
  }
}

async function openClassDropdown(page) {
  // Classic ALEKS instructor nav: CLASS » custom searchbar
  const searchbar = page.locator("#sim_nav_sel_searchbar_1")
  if (await searchbar.count()) {
    const list = page.locator("#sim_nav_sel_searchbar_1 .scroll_divSB, #sim_nav_sel_searchbar_1 .tableSB")
    if (!(await list.first().isVisible().catch(() => false))) {
      await clickFirst(page, [
        "#sim_nav_sel_searchbar_1 .pulldownSB",
        "#sim_nav_sel_searchbar_1_selected",
        "#sim_nav_sel_searchbar_1_button",
        "#sim_nav_sel_searchbar_1",
      ])
      await page.waitForTimeout(500)
    }
    return
  }

  await clickFirst(page, [
    'text=/^Class$/i',
    '[aria-label*="Class" i]',
    'a:has-text("Class")',
    'button:has-text("Class")',
    '#class_selector',
    '.class-selector',
  ])
}

async function expandArchivedInClassMenu(page) {
  const header = page
    .locator("#sim_nav_sel_searchbar_1 tr.archive.unselectable .openclose, #sim_nav_sel_searchbar_1 tr.archive .openclose")
    .first()
  if (!(await header.count())) return

  const needsExpand = await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll(
        "#sim_nav_sel_searchbar_1 tr.listed_elementSB.archive .sim_sb_entry_tag_left",
      ),
    ]
    if (rows.length === 0) return true
    return rows.some((el) => {
      const tr = el.closest("tr")
      return tr && tr.style.display === "none"
    })
  })

  if (needsExpand) {
    await header.click({ force: true }).catch(() => {})
    await page.waitForTimeout(500)
  }
}

/** Infer semester markers from a period key like spring2026_exam2 / spring_exam1_2026. */
function termHintsFromPeriod(periodKey = "") {
  const key = String(periodKey).toLowerCase()
  if (/spring/.test(key)) {
    return {
      prefer: /SP26|Sp26|Spring\s*26|Spring\s*2026/i,
      avoid: /Su26|Sum\s*26|F26|Fall\s*26|Su25|Sum\s*25|F25|Fall\s*25/i,
      label: "spring",
    }
  }
  if (/summer|su\d/.test(key)) {
    return {
      prefer: /Su26|Sum\s*26|Summer\s*26|Summer\s*2026/i,
      avoid: /SP26|Sp26|Spring\s*26|F26|Fall\s*26|SP25|F25/i,
      label: "summer",
    }
  }
  if (/fall/.test(key)) {
    return {
      prefer: /F26|Fall\s*26|Fall\s*2026/i,
      avoid: /Su26|Sum\s*26|SP26|Sp26|Su25|SP25/i,
      label: "fall",
    }
  }
  return null
}

function scoreClassForSync(cls, periodKey = "") {
  let score = 0
  const name = cls.aleksName || ""
  const hints = termHintsFromPeriod(periodKey)
  if (hints) {
    if (hints.prefer.test(name)) score += 50
    if (hints.avoid.test(name)) score -= 30
  } else {
    if (/Su26|Sum\s*26|SP26|Sp26|F26|Fall\s*26|Spring\s*26/i.test(name)) score += 20
  }
  if (/Su25|Sum\s*25|SP25|Sp25|F25|Fall\s*25|Spring\s*25/i.test(name)) score += 5
  if (!cls.archived) score += 2
  return score
}

/** One class per section — prefer classes matching the exam period's semester. */
function dedupeClassesBySection(classes, knownSections = [], periodKey = "") {
  const hints = termHintsFromPeriod(periodKey)
  let pool = classes
  if (hints) {
    const matching = classes.filter((c) => hints.prefer.test(c.aleksName || ""))
    if (matching.length > 0) {
      console.log(
        `Filtering to ${hints.label} classes: ${matching.length}/${classes.length}`,
      )
      pool = matching
    }
  }

  const filtered =
    knownSections.length > 0
      ? pool.filter((c) => knownSections.includes(c.sectionNumber))
      : pool

  const bySection = new Map()
  for (const cls of filtered.length > 0 ? filtered : pool) {
    const prev = bySection.get(cls.sectionNumber)
    if (!prev || scoreClassForSync(cls, periodKey) > scoreClassForSync(prev, periodKey)) {
      bySection.set(cls.sectionNumber, cls)
    }
  }
  return [...bySection.values()]
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Scrape Class dropdown (active + archived) from classic ALEKS searchbar.
 */
async function discoverClasses(page, downloadDir, knownSections = [], periodKey = "") {
  await openClassDropdown(page)
  await page.waitForTimeout(500)
  await expandArchivedInClassMenu(page)
  await screenshot(page, downloadDir, "classes-menu")

  const rows = await page.evaluate(() => {
    const out = []
    const nodes = document.querySelectorAll(
      "#sim_nav_sel_searchbar_1 .sim_sb_entry_tag_left, .sim_sb_entry_tag_left",
    )
    for (const el of nodes) {
      const name = (el.textContent || "").replace(/\s+/g, " ").trim()
      if (!name) continue
      const row = el.closest("tr")
      const archived = Boolean(row?.classList.contains("archive"))
      out.push({ name, archived })
    }
    return out
  })

  await page.keyboard.press("Escape").catch(() => {})
  await page.waitForTimeout(200)

  const classes = []
  const seen = new Set()
  for (const row of rows) {
    const key = row.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    classes.push({
      aleksName: row.name,
      sectionNumber: sectionFromClassName(row.name, knownSections),
      archived: row.archived,
    })
  }

  if (classes.length === 0) {
    throw new Error("No classes found in ALEKS CLASS menu (active or archived)")
  }

  const picked = dedupeClassesBySection(classes, knownSections, periodKey)
  if (picked.length > 0) {
    console.log(`Using ${picked.length}/${classes.length} class(es) after section/term filter`)
    return picked
  }
  return classes
}

async function selectClass(page, { aleksName, archived }, downloadDir) {
  await openClassDropdown(page)
  await page.waitForTimeout(400)
  if (archived) await expandArchivedInClassMenu(page)

  const classOption = page
    .locator("#sim_nav_sel_searchbar_1 tr.listed_elementSB .sim_sb_entry_tag_left")
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(aleksName)}\\s*$`) })
    .first()

  try {
    if (!(await classOption.isVisible().catch(() => false))) {
      await expandArchivedInClassMenu(page)
    }
    // Archived rows may remain display:none until expand; force click is reliable
    await classOption.click({ force: true, timeout: 10000 })
  } catch (err) {
    try {
      await page
        .locator(".sim_sb_entry_tag_left")
        .filter({ hasText: aleksName })
        .first()
        .click({ force: true, timeout: 5000 })
    } catch {
      await screenshot(page, downloadDir, `class-not-found-${aleksName.replace(/\W+/g, "_")}`)
      throw new Error(`Could not select class "${aleksName}": ${err.message}`)
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function openTimeAndTopic(page) {
  // Classic ALEKS: hover/click Reports nav, then Time & Topic
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

/** YYYY-MM-DD → parts for ALEKS month/day/year selects (month is 1-12). */
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

/** Pick a <select> option by numeric value (handles "2" vs "02"). */
async function selectNumericOption(page, selectId, wanted) {
  const result = await page.evaluate(
    ({ selectId, wanted }) => {
      const el = document.getElementById(selectId)
      if (!el) return { ok: false, error: `missing #${selectId}` }
      const opts = [...el.options].map((o) => ({
        value: o.value,
        text: (o.textContent || "").trim(),
      }))
      const n = Number(wanted)
      const match =
        opts.find((o) => String(Number(o.value)) === String(n) && o.value !== "") ||
        opts.find((o) => o.value === String(wanted)) ||
        opts.find((o) => o.value === String(wanted).padStart(2, "0")) ||
        opts.find((o) => o.text === String(wanted)) ||
        opts.find((o) => new RegExp(`^0*${n}$`).test(o.value))
      if (!match) {
        return {
          ok: false,
          error: `no option ${wanted} in #${selectId}`,
          opts,
        }
      }
      el.value = match.value
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      // Some ALEKS scripts listen for jQuery change
      if (window.jQuery) {
        try {
          window.jQuery(el).trigger("change")
        } catch {
          /* ignore */
        }
      }
      return { ok: true, value: match.value, opts }
    },
    { selectId, wanted: String(wanted) },
  )
  if (!result.ok) {
    console.log(`selectNumericOption failed: ${result.error}`, result.opts || "")
    throw new Error(result.error || `Failed to set #${selectId}`)
  }
}

async function setAleksDateParts(page, prefix, iso) {
  const parts = isoToAleksParts(iso)
  // Day→1 first so month changes never hit an invalid day (e.g. Mar 31 → Feb).
  await selectNumericOption(page, `${prefix}_date_day`, "1")
  await selectNumericOption(page, `${prefix}_date_year`, parts.year)
  await selectNumericOption(page, `${prefix}_date_month`, parts.month)
  await selectNumericOption(page, `${prefix}_date_day`, parts.day)
  await page.waitForTimeout(150)

  // Force hidden YYYY-MM-DD fields that ALEKS submits / mirrors.
  await page.evaluate(
    ({ prefix, iso }) => {
      const hidden = document.getElementById(`${prefix}_date`)
      if (!hidden) return
      hidden.value = iso
      hidden.dispatchEvent(new Event("input", { bubbles: true }))
      hidden.dispatchEvent(new Event("change", { bubbles: true }))
      if (window.jQuery) {
        try {
          window.jQuery(hidden).trigger("change")
        } catch {
          /* ignore */
        }
      }
    },
    { prefix, iso },
  )
}

async function setDateRangeAndCompute(page, startIso, endIso, downloadDir) {
  await page.locator("a").filter({ hasText: /^Change Date Range$/i }).first().click()
  await page.waitForSelector("#from_date_month", { state: "visible", timeout: 15000 })
  await page.waitForTimeout(300)

  await setAleksDateParts(page, "from", startIso)
  await setAleksDateParts(page, "to", endIso)
  await page.waitForTimeout(200)

  let hiddenFrom = await page.locator("#from_date").inputValue()
  let hiddenTo = await page.locator("#to_date").inputValue()
  console.log(`Date selects set → hidden fields ${hiddenFrom} → ${hiddenTo}`)

  if (hiddenFrom !== startIso || hiddenTo !== endIso) {
    // One more hard set of hidden fields, then re-read.
    await page.evaluate(
      ({ startIso, endIso }) => {
        for (const [id, iso] of [
          ["from_date", startIso],
          ["to_date", endIso],
        ]) {
          const el = document.getElementById(id)
          if (!el) continue
          el.value = iso
          el.dispatchEvent(new Event("change", { bubbles: true }))
        }
      },
      { startIso, endIso },
    )
    hiddenFrom = await page.locator("#from_date").inputValue()
    hiddenTo = await page.locator("#to_date").inputValue()
    console.log(`After hidden force → ${hiddenFrom} → ${hiddenTo}`)
  }

  if (hiddenFrom !== startIso || hiddenTo !== endIso) {
    const debug = await page.evaluate(() => {
      const dump = (id) => {
        const el = document.getElementById(id)
        if (!el) return null
        return {
          value: el.value,
          options: [...el.options].map((o) => o.value),
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
    .locator('a')
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
    // Fallback: fetch the .xlsx href directly (ALEKS sometimes marks the popup link "hidden")
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
          // Class switch refreshes the same Time and Topic report; no need to re-open it.
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
        // ZIP/XLSX magic: PK\x03\x04
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
