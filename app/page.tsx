import Link from "next/link"
import Image from "next/image"
import { BarChart3, FileText, Users, ArrowRight, Building2, Globe, Lock, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"

const features = [
  { Icon: FileText, title: "Loan Tracking", desc: "Track guarantee applications from submission through approval and disbursement with full audit trails." },
  { Icon: BarChart3, title: "Real-time Analytics", desc: "Monitor portfolio performance, bank utilization, and risk metrics with interactive dashboards." },
  { Icon: Users, title: "Multi-role Access", desc: "Six distinct user roles with granular permissions for PRSF staff, banks, and auditors." },
  { Icon: Building2, title: "Bank Management", desc: "Manage participating financial institutions, branches, and their allocated guarantee limits." },
  { Icon: Globe, title: "Multilingual", desc: "Full support for English, Russian, and Tajik languages across the entire platform." },
  { Icon: Shield, title: "Enterprise Security", desc: "Row-level security, encrypted data, role-based access control, and comprehensive audit logging." },
]

const stats = [
  { value: "15+", label: "Partner Banks" },
  { value: "$50M+", label: "Guarantees Managed" },
  { value: "6", label: "User Roles" },
  { value: "3", label: "Languages" },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="PRSF" width={36} height={36} className="rounded" />
            <span className="text-lg font-semibold tracking-tight">Credit Guarantee Fund</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/sign-up">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center lg:py-28">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
            Ministry of Finance of the Republic of Tajikistan
          </div>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl">
            Credit Guarantee Fund
            <span className="block text-primary">Management Information System</span>
          </h1>
          <p className="mb-10 text-lg leading-relaxed text-muted-foreground lg:text-xl">
            A comprehensive management information system for tracking MSME loan guarantees,
            monitoring bank performance, and managing risk across partner financial institutions.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/auth/login" className="gap-2">
                Access Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/auth/sign-up">Create Account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border px-6 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="px-6 py-10 text-center">
              <div className="text-3xl font-bold text-primary">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight">Core Capabilities</h2>
          <p className="text-muted-foreground">Everything you need to manage loan guarantees efficiently and securely.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <feature.Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-2 text-base font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <Lock className="mx-auto mb-4 h-10 w-10 text-primary" />
            <h2 className="mb-3 text-2xl font-bold">Enterprise-Grade Security</h2>
            <p className="mb-6 text-muted-foreground">
              Built on Supabase with Row Level Security, AES-256 encryption, and comprehensive audit trails.
              Every action is logged and traceable.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {["Row-level Security", "Role-based Access", "Audit Logging", "Data Encryption"].map((item) => (
                <span key={item} className="rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="mb-3 text-2xl font-bold text-primary-foreground">Ready to get started?</h2>
          <p className="mb-8 text-primary-foreground/80">
            Sign in to access the dashboard or create a new account.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" asChild>
              <Link href="/auth/sign-up">Create Account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="PRSF" width={24} height={24} className="rounded" />
            <span className="text-sm font-medium">Credit Guarantee Fund MIS</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Ministry of Finance of the Republic of Tajikistan. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
