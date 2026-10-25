import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import { readFileSync } from 'node:fs'

const pixel = new Uint8Array(readFileSync(new URL('../app/icon.png', import.meta.url)))
for (const orientation of ['portrait', 'landscape']) {
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  pdf.addImage(pixel, 'PNG', 10, 10, 20, 20)
  pdf.addPage()
  pdf.addImage(pixel, 'PNG', 10, 10, 20, 20)
  assert.equal(pdf.getNumberOfPages(), 2)
  assert.ok(pdf.output().startsWith('%PDF-'))
  assert.ok(pdf.output('arraybuffer').byteLength > 1000)
}
console.log('Upgraded PDF API smoke test: PNG input, page slicing API and serialization passed')
