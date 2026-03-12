import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Mail } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default function SignUpSuccessPage() {
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
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                <CheckCircle2 className="h-7 w-7 text-accent" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Account Created</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your account request has been submitted successfully.
              </p>

              <div className="mt-8 flex items-start gap-3 rounded-lg bg-secondary p-4 text-left">
                <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Check your email</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    We have sent a verification link to your email address. Click the link to verify your account.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <p className="text-sm text-foreground">
                  <strong>Note:</strong>{' '}
                  <span className="text-muted-foreground">Your account will need to be approved by a PRSF administrator before access is granted.</span>
                </p>
              </div>

              <Button asChild className="mt-8 h-11 w-full text-sm font-semibold">
                <Link href="/auth/login">Return to Login</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
