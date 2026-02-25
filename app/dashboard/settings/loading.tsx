import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export default function LoadingSettings() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-28" />)}
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
