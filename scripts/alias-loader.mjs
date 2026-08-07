/**
 * Minimal Node resolve hook that maps the project's "@/..." TS path alias onto
 * real file URLs, so the workflow engine can be exercised by plain `node`
 * without pulling in a bundler or a test runner.
 */
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

const ROOT = process.cwd()
const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = resolvePath(ROOT, specifier.slice(2))
    for (const ext of EXTENSIONS) {
      const candidate = base + ext
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
  }
  return nextResolve(specifier, context)
}
