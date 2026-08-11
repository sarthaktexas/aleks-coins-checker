/**
 * Shared Playwright helpers for ALEKS instructor automation.
 */
import fs from "node:fs/promises"
import path from "node:path"

export function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

/** Derive portal section number from an ALEKS class label. */
export function sectionFromClassName(aleksName, knownSections = []) {
  const name = String(aleksName || "").trim()
  const candidates = []

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
    const bare = uniq.find((c) => /^\d+$/.test(c) && !/^0\d/.test(c)) || uniq[0]
    return bare
  }

  return name.replace(/\s+/g, "_").slice(0, 40)
}

export async function screenshot(page, downloadDir, name) {
  try {
    await page.screenshot({ path: path.join(downloadDir, `${name}.png`), fullPage: true })
  } catch {
    /* ignore */
  }
}

export async function clickFirst(page, selectors, { timeout = 15000 } = {}) {
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

export async function fillFirst(page, selectors, value, { timeout = 10000 } = {}) {
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

export async function login(page, username, password, downloadDir) {
  await page.goto("https://www.aleks.com/", { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(1500)

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

  const stillOnLogin = await page.locator("#login_name_full").isVisible().catch(() => false)
  if (stillOnLogin) {
    if (downloadDir) await screenshot(page, downloadDir, "00-login-still-on-form")
    throw new Error("ALEKS login did not navigate away from the login form (check credentials)")
  }
}

export async function openClassDropdown(page) {
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

export async function expandArchivedInClassMenu(page) {
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

export function termHintsFromPeriod(periodKey = "") {
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

export function scoreClassForSync(cls, periodKey = "") {
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

export function dedupeClassesBySection(classes, knownSections = [], periodKey = "") {
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

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function discoverClasses(page, downloadDir, knownSections = [], periodKey = "") {
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

export async function selectClass(page, { aleksName, archived }, downloadDir) {
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

export async function fetchJson(appUrl, token, pathname, { method = "GET", body } = {}) {
  const url = `${appUrl.replace(/\/$/, "")}${pathname}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${method} ${pathname} failed (${res.status}): ${data.error || res.statusText}`)
  }
  return data
}

export async function ensureDownloadDir(downloadDir) {
  await fs.mkdir(downloadDir, { recursive: true })
}
