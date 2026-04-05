'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ColumnConfigError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Column Config Error]', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <Card className="max-w-md w-full border-destructive/50 bg-destructive/5">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-destructive">Column Settings Error</CardTitle>
          <CardDescription>
            There was a problem loading the column configuration page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded bg-muted p-3 text-xs font-mono overflow-auto max-h-32">
            <p className="text-muted-foreground">{error.message}</p>
          </div>
          <Button onClick={reset} className="w-full" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
