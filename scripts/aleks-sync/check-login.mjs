/**
 * Smoke-test ALEKS instructor credentials (login only).
 *
 * Required env:
 *   ALEKS_USERNAME, ALEKS_PASSWORD
 *
 * Optional:
 *   HEADED=1 — show browser
 *   DOWNLOAD_DIR — screenshot folder (default: .downloads-check-login)
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { login, requireEnv, screenshot } from "./aleks-browser.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const username = requireEnv("ALEKS_USERNAME")
  const password = requireEnv("ALEKS_PASSWORD")
  const headed = process.env.HEADED === "1"
  const downloadDir =
    process.env.DOWNLOAD_DIR || path.join(__dirname, ".downloads-check-login")

  await fs.mkdir(downloadDir, { recursive: true })

  console.log(`Checking ALEKS login for user "${username}" (headed=${headed})…`)

  const browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await login(page, username, password, downloadDir)
    await screenshot(page, downloadDir, "01-after-login")
    const title = await page.title().catch(() => "")
    const url = page.url()
    console.log(JSON.stringify({ ok: true, url, title }, null, 2))
    console.log("ALEKS login succeeded.")
  } catch (err) {
    await screenshot(page, downloadDir, "00-check-login-failed").catch(() => {})
    console.error("ALEKS login failed:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
