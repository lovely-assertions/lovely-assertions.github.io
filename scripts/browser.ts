/**
 * Launching the browser these checks drive, spelled once.
 *
 * Seven scripts open a browser, and every one of them was calling
 * `launch()` directly. That worked everywhere except the only place
 * that matters on a fresh machine: GitHub's Ubuntu runners disable unprivileged
 * user namespaces through AppArmor, so Chrome's sandbox has nothing to build on
 * and the process aborts before the first page loads --
 * `FATAL … No usable sandbox!`.
 *
 * `--no-sandbox` is the documented answer, and it is a real reduction in
 * isolation, so it is worth saying what it costs here. Every page these scripts
 * open is a file this build just produced, served from localhost or loaded as a
 * string. No remote origin, no user input, nothing fetched at run time. The
 * sandbox exists to contain hostile web content, and there is none.
 *
 * Unconditional rather than gated on CI, deliberately: a flag that only applies
 * on the runner means the browser a contributor drives is not the browser that
 * decides whether the build passes, which is how "works locally" is born.
 */

import type { Browser, LaunchOptions } from 'puppeteer'
import puppeteer from 'puppeteer'

export function launch(options: LaunchOptions = {}): Promise<Browser> {
  return puppeteer.launch({ ...options, args: ['--no-sandbox', ...(options.args ?? [])] })
}
