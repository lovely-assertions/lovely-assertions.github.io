/**
 * The build, served the way GitHub Pages serves it.
 *
 * One server for the four gates that need a browser. Each used to carry its own
 * copy, and their content-type tables had drifted into four different answers
 * for the same file: two used a table with an `application/octet-stream`
 * fallback, two used a ternary chain falling back to `text/html`, and only one
 * of them knew about `.wasm`. A gate is a claim about what the deploy serves,
 * so a gate that serves different bytes from its neighbour is measuring a site
 * nobody visits.
 *
 * Two behaviours are load-bearing and are why this is not `http-server`: a
 * directory resolves to its `index.html`, and anything missing is a 404 rather
 * than a rewrite to the app shell. A dev server that rewrites everything to the
 * index is exactly what hides a broken deep link.
 *
 * The status is decided before a byte of it is written. Every server this
 * replaced resolved a directory to `index.html` and then piped it without
 * asking whether it was there -- so a request for `/docs/guides/`, a real
 * directory with no page of its own, answered `200` with an empty body and then
 * threw an unhandled stream error that took the whole gate down with it. A gate
 * that dies is obvious; a gate that measures an empty `200` and calls it a pass
 * is not, and that is the failure this ordering removes.
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { ROOT } from '../pipeline/corpus.ts'

export const BUILD = path.join(ROOT, 'build/client')

/**
 * The union of what the gates need.
 *
 * The fallback is deliberately `application/octet-stream` and not `text/html`:
 * an unmapped type should look obviously wrong in a browser rather than be
 * quietly decoded as a page.
 */
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.whl': 'application/octet-stream',
}

/** The file a request names, or null if there is nothing to send. */
async function resolve(url: string): Promise<string | null> {
  let file: string
  try {
    // Malformed percent-encoding throws here, and a request is allowed to be
    // malformed without ending the process that received it.
    file = path.join(BUILD, decodeURIComponent(new URL(url, 'http://x').pathname))
  } catch {
    return null
  }

  try {
    if ((await stat(file)).isDirectory()) {
      file = path.join(file, 'index.html')
      await stat(file)
    }
  } catch {
    return null
  }
  return file
}

/**
 * `build/client` and nothing else.
 *
 * It took a `root` for a while, so `compare-design.ts` could point a second
 * instance at the design handoff. That script and that directory are gone, and
 * a parameter with no caller is a guess about a future nobody has asked for.
 */
export function serve(port: number): Server {
  return createServer((request, response) => {
    void (async () => {
      const file = await resolve(request.url ?? '/')
      if (file === null) {
        response.writeHead(404).end('not found')
        return
      }

      response.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      })
      // A read that fails after the header is out cannot be turned into a
      // status, so it ends the response instead of escaping as an uncaught
      // exception and killing the gate.
      createReadStream(file)
        .on('error', () => response.destroy())
        .pipe(response)
    })()
  }).listen(port)
}
