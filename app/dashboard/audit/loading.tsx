import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export default function LoadingAudit() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardContent className="p-4 flex gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 flex-1" />)}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="flex gap-4 items-center px-4 py-3 border-b last:border-0">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
