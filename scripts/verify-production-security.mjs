import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = 3101
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
})
let output = ''
server.stdout.on('data', (chunk) => { output += chunk })
server.stderr.on('data', (chunk) => { output += chunk })
server.on('error', (error) => { output += error.message })
try {
  let ready = false
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited: ${output}`)
    try {
      const response = await fetch(`${origin}/auth/login`, { signal: AbortSignal.timeout(1000) })
      ready = response.ok
      if (ready) break
    } catch {}
    await delay(250)
  }
  assert.ok(ready, `Production server did not become ready: ${output}`)
  for (const [path, status] of [['/dashboard/fees', 307], ['/api/admin/create-user', 401], ['/auth/login', 200]]) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, status, `Unexpected response for ${path}`)
    const cache = response.headers.get('cache-control') ?? ''
    assert.ok(cache.includes('no-store') && !cache.includes('public'), `Unsafe caching on ${path}: ${cache}`)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    console.log(`${path}: ${response.status}; ${cache}; security headers present`)
  }
} finally {
  server.kill('SIGTERM')
}
