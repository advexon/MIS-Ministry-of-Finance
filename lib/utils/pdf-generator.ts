"use client"

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

interface PDFOptions {
  filename?: string
  format?: 'a4' | 'letter'
  orientation?: 'portrait' | 'landscape'
  quality?: number
  margin?: number
}

/**
 * Generate and download a PDF from an HTML element
 */
export async function downloadPDF(
  element: HTMLElement,
  options: PDFOptions = {}
): Promise<void> {
  const {
    filename = 'document.pdf',
    format = 'a4',
    orientation = 'portrait',
    quality = 2,
    margin = 10,
  } = options

  // Create canvas from the element
  const canvas = await html2canvas(element, {
    scale: quality,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  // Page dimensions (mm)
  const pageWidth = format === 'a4' ? 210 : 216
  const pageHeight = format === 'a4' ? 297 : 279

  // Printable content area (mm)
  const contentWidth = pageWidth - margin * 2
  const contentHeightMM = pageHeight - margin * 2

  // Pixels-per-mm based on how the canvas width maps onto the content width
  const pxPerMM = canvas.width / contentWidth
  // Height of a single page worth of content, in source canvas pixels
  const pageHeightPx = contentHeightMM * pxPerMM

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format,
  })

  const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx))

  for (let page = 0; page < totalPages; page++) {
    const sourceY = page * pageHeightPx
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sourceY)

    // Draw this page's slice onto a temporary canvas
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeightPx
    const ctx = pageCanvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx,
      )
    }

    // Convert slice height back to mm so the on-page image keeps the same scale
    const sliceHeightMM = sliceHeightPx / pxPerMM
    const imgData = pageCanvas.toDataURL('image/png')

    if (page > 0) pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, sliceHeightMM)
  }

  // Download
  pdf.save(filename)
}

/**
 * Print an HTML element directly
 */
export function printElement(element: HTMLElement): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const styles = Array.from(document.styleSheets)
    .map(styleSheet => {
      try {
        return Array.from(styleSheet.cssRules)
          .map(rule => rule.cssText)
          .join('\n')
      } catch {
        return ''
      }
    })
    .join('\n')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Document</title>
        <style>
          ${styles}
          @media print {
            body { margin: 0; padding: 0; }
            @page { margin: 15mm; }
          }
        </style>
      </head>
      <body>
        ${element.outerHTML}
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 250)
}
