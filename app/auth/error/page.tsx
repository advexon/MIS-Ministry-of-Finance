import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Image src="/logo.png" alt="Emblem of Tajikistan" width={32} height={32} style={{ width: 'auto', height: 'auto' }} />
          <div>
            <span className="text-sm font-bold text-foreground">Credit Guarantee Fund</span>
            <p className="text-[10px] text-muted-foreground">Management Information System</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="shadow-sm">
            <CardContent className="px-8 py-10 text-center">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Authentication Error</h1>

              <div className="mt-6 rounded-lg bg-destructive/10 px-4 py-3">
                <p className="text-sm text-destructive">
                  {params?.error
                    ? `Error: ${params.error}`
                    : 'An unexpected authentication error occurred.'}
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-3">
                <Button asChild className="h-11 w-full text-sm font-semibold">
                  <Link href="/auth/login">Try Again</Link>
                </Button>
                <Button asChild variant="outline" className="h-11 w-full bg-transparent text-sm font-semibold">
                  <Link href="/">Return to Home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
