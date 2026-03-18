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

  // Calculate dimensions
  const imgWidth = format === 'a4' ? 210 : 216 // mm
  const imgHeight = format === 'a4' ? 297 : 279 // mm
  
  const contentWidth = imgWidth - (margin * 2)
  const contentHeight = (canvas.height * contentWidth) / canvas.width

  // Create PDF
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format,
  })

  // Add the image
  const imgData = canvas.toDataURL('image/png')
  
  // Handle multi-page if content is taller than page
  let heightLeft = contentHeight
  let position = margin
  const pageHeight = imgHeight - (margin * 2)

  pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - contentHeight + margin
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight)
    heightLeft -= pageHeight
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
