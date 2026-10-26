'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ReportChartCardProps {
  title: string
  description?: string
  children: ReactNode
  onExport?: () => void
}

export function ReportChartCard({ title, description, children, onExport }: ReportChartCardProps) {
  const uiText = useUiTranslation()

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">{uiText(title)}</CardTitle>
          {description && <CardDescription className="text-xs">{uiText(description)}</CardDescription>}
        </div>
        {onExport && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onExport} aria-label={`Export ${title}`}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
