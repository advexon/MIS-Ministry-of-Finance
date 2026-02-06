import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Mail } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Emblem of Tajikistan" width={40} height={40} className="rounded-lg" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">PRSF MIS</h1>
            <p className="text-xs text-muted-foreground">Partial Risk Sharing Facility</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-lg">
            <CardHeader className="space-y-4 pb-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl font-bold">Account Created!</CardTitle>
              <CardDescription className="text-balance">
                Your account request has been submitted successfully.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
                <Mail className="mt-0.5 h-5 w-5 text-primary" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Check your email</p>
                  <p className="mt-1 text-muted-foreground">
                    We have sent a verification link to your email address. Please click the link to verify your account.
                  </p>
                </div>
              </div>
              
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Your account will need to be approved by a PRSF administrator before you can access the system.
                </p>
              </div>

              <Button asChild className="w-full">
                <Link href="/auth/login">Return to Login</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
