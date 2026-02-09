import Link from "next/link"
import Image from "next/image"
import { BarChart3, FileText, Users, ArrowRight, Building2, Globe, Lock, Shield, CheckCircle2 } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Emblem of Tajikistan" width={36} height={36} className="h-9 w-9 object-contain" />
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-foreground">PRSF MIS</span>
              <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">Loan Tracking System</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Sign In
            </Link>
            <Link
              href="/auth/sign-up"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/[0.03]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <Globe className="h-3.5 w-3.5 text-accent" />
              <span>Ministry of Finance of the Republic of Tajikistan</span>
            </div>
            <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Partial Risk Sharing Facility
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              A comprehensive Management Information System for tracking and managing 
              loan guarantees to MSME borrowers across Tajikistan.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/login"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
              >
                Access the System
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth/sign-up"
                className="inline-flex h-12 items-center gap-2 rounded-lg border bg-card px-8 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-secondary"
              >
                Request Access
              </Link>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mx-auto mt-20 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-sm lg:grid-cols-4">
            {[
              { value: "847+", label: "Loans Guaranteed" },
              { value: "TJS 125M+", label: "Total Disbursed" },
              { value: "6", label: "Partner Banks" },
              { value: "50+", label: "Bank Branches" },
            ].map((stat) => (
              <div key={stat.label} className="bg-card px-6 py-5 text-center">
                <p className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-card py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 max-w-lg">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Capabilities</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
              Designed for comprehensive loan guarantee management
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: FileText, title: "Loan Applications", desc: "Submit, review, and approve loan guarantee applications with multi-step workflows." },
              { icon: BarChart3, title: "Portfolio Analytics", desc: "Real-time dashboards on disbursements, delinquency, and portfolio performance." },
              { icon: Building2, title: "Bank Management", desc: "Manage partner banks, branches, and their loan portfolios across the facility." },
              { icon: Users, title: "Borrower Tracking", desc: "Complete borrower profiles with loan history, payments, and risk assessment." },
            ].map((feature) => (
              <div key={feature.title} className="bg-card p-8">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-t py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-20">
            <div className="flex-1">
              <p className="text-sm font-semibold uppercase tracking-widest text-accent">Security</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                Enterprise-grade protection
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Built with robust security measures including role-based access control, 
                audit trails, data encryption, and multi-language support for Tajikistan&apos;s 
                diverse financial ecosystem.
              </p>
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              {[
                { icon: Lock, text: "Role-based access control" },
                { icon: Shield, text: "Row-level data security" },
                { icon: Globe, text: "Trilingual support (EN/RU/TJ)" },
                { icon: CheckCircle2, text: "Full audit trail logging" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3 rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-balance text-2xl font-bold text-primary-foreground sm:text-3xl">
            Ready to streamline loan guarantee management?
          </h2>
          <p className="mt-4 text-primary-foreground/70">
            Access the system today or request credentials from your administrator.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/login"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-card px-8 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-secondary"
            >
              Sign In
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth/sign-up"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-primary-foreground/20 px-8 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-foreground/10"
            >
              Request Access
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-foreground py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Emblem of Tajikistan" width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="text-sm font-medium text-background/90">PRSF Loan Tracking MIS</span>
            </div>
            <p className="text-xs text-background/50">
              Ministry of Finance of the Republic of Tajikistan. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
