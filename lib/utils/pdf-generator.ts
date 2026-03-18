'use client'

/**
 * PDF Generator Utility
 * Uses html2canvas + jsPDF for high-quality PDF generation from React components
 */

export interface PDFOptions {
  filename?: string
  format?: 'a4' | 'letter'
  orientation?: 'portrait' | 'landscape'
  margin?: number
  quality?: number
}

const DEFAULT_OPTIONS: Required<PDFOptions> = {
  filename: 'document.pdf',
  format: 'a4',
  orientation: 'portrait',
  margin: 10,
  quality: 2,
}

/**
 * Generate PDF from an HTML element
 */
export async function generatePDF(
  element: HTMLElement,
  options: PDFOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Dynamically import libraries
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // Capture the element as canvas
  const canvas = await html2canvas(element, {
    scale: opts.quality,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  })

  // Calculate dimensions
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: opts.orientation,
    unit: 'mm',
    format: opts.format,
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = opts.margin

  const imgWidth = pageWidth - margin * 2
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  // Handle multi-page documents
  let heightLeft = imgHeight
  let position = margin

  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
  heightLeft -= pageHeight - margin * 2

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= pageHeight - margin * 2
  }

  return pdf.output('blob')
}

/**
 * Download PDF from an HTML element
 */
export async function downloadPDF(
  element: HTMLElement,
  options: PDFOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const blob = await generatePDF(element, opts)

  // Create download link
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = opts.filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Print the document using browser print dialog
 */
export function printElement(element: HTMLElement): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to print the document.')
    return
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Document</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: 'Times New Roman', serif;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
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

  // Wait for content to load
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 500)
}
