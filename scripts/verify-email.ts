import assert from 'node:assert/strict'

process.env.RESEND_API_KEY = 're_contract_test_only'
process.env.RESEND_EMAIL_DOMAIN = 'sender.example.org'
delete process.env.EMAIL_FROM

const requests: { body: Record<string, unknown>; headers: Headers }[] = []
let reply: unknown = { id: 'provider-message-id' }
let status = 200
let transportFails = false
const originalFetch = globalThis.fetch

globalThis.fetch = async (_input, init) => {
  requests.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) })
  if (transportFails) throw new Error('Simulated network failure')
  return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } })
}

async function main() {
try {
  const { sendEmail } = await import('@/lib/email/service')
  const options = { to: 'delivered@resend.dev', subject: 'Contract test', html: '<p>Test</p>', idempotencyKey: 'workflow/event-test' }
  assert.deepEqual(await sendEmail(options), { success: true, id: 'provider-message-id' })
  assert.equal(requests[0].body.from, 'CGF MIS <notifications@sender.example.org>')
  assert.deepEqual(requests[0].body.to, ['delivered@resend.dev'])
  assert.equal(requests[0].headers.get('Idempotency-Key'), 'workflow/event-test')

  process.env.EMAIL_FROM = 'CGF MIS <custom@verified.example.org>'
  await sendEmail(options)
  assert.equal(requests[1].body.from, process.env.EMAIL_FROM)

  status = 403
  reply = { name: 'validation_error', message: 'Sender domain is not verified' }
  const rejected = await sendEmail(options)
  assert.equal(rejected.success, false)
  assert.equal(rejected.error, 'Sender domain is not verified')

  status = 200
  reply = {}
  assert.equal((await sendEmail(options)).success, false)
  transportFails = true
  assert.equal((await sendEmail(options)).success, false)

  delete process.env.EMAIL_FROM
  delete process.env.RESEND_EMAIL_DOMAIN
  const count = requests.length
  assert.equal((await sendEmail(options)).success, false)
  assert.equal(requests.length, count)
  console.log('Email contract checks passed: configured sender, override, idempotency, provider rejection, missing acknowledgement, transport failure and missing sender. No email was sent.')
} finally {
  globalThis.fetch = originalFetch
}
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
