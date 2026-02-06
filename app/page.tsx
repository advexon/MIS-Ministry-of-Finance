import Link from "next/link"
import Image from "next/image"
import { BarChart3, FileText, Users, ArrowRight, Building2, Globe, Lock, Shield } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[hsl(210,40%,98%)]">
      {/* Header */}
      <header className="border-b bg-[hsl(0,0%,100%)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Emblem of Tajikistan" width={40} height={40} className="h-10 w-10 object-contain" />
            <div>
              <span className="text-lg font-bold text-[hsl(222,47%,11%)]">PRSF MIS</span>
              <p className="text-[10px] text-[hsl(215,16%,47%)]">Loan Tracking System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-[hsl(222,47%,11%)] transition-colors hover:bg-[hsl(210,40%,96%)]"
            >
              Sign In
            </Link>
            <Link
              href="/auth/sign-up"
              className="rounded-lg bg-[hsl(217,91%,40%)] px-4 py-2 text-sm font-medium text-[hsl(0,0%,100%)] transition-colors hover:bg-[hsl(217,91%,35%)]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-[hsl(0,0%,100%)] px-4 py-1.5 text-sm text-[hsl(215,16%,47%)]">
            <Globe className="h-4 w-4" />
            Ministry of Finance of the Republic of Tajikistan
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-[hsl(222,47%,11%)] sm:text-5xl lg:text-6xl">
            Partial Risk Sharing Facility
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[hsl(215,16%,47%)]">
            A comprehensive Management Information System for tracking and managing loan guarantees 
            to MSME borrowers across Tajikistan&apos;s partner financial institutions.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-lg bg-[hsl(217,91%,40%)] px-6 py-3 text-base font-medium text-[hsl(0,0%,100%)] transition-colors hover:bg-[hsl(217,91%,35%)]"
            >
              Access the System
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center gap-2 rounded-lg border bg-[hsl(0,0%,100%)] px-6 py-3 text-base font-medium text-[hsl(222,47%,11%)] transition-colors hover:bg-[hsl(210,40%,96%)]"
            >
              Request Access
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-[hsl(0,0%,100%)] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-[hsl(222,47%,11%)]">System Capabilities</h2>
            <p className="mt-3 text-[hsl(215,16%,47%)]">Designed for comprehensive loan guarantee management</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: FileText, title: "Loan Applications", desc: "Submit, review, and approve loan guarantee applications with multi-step workflows" },
              { icon: BarChart3, title: "Portfolio Analytics", desc: "Real-time dashboards and reports on disbursements, delinquency, and portfolio performance" },
              { icon: Building2, title: "Bank Management", desc: "Manage partner banks, branches, and their loan portfolios across the facility" },
              { icon: Users, title: "Borrower Tracking", desc: "Complete borrower profiles with loan history, payment schedules, and risk assessment" },
            ].map((feature) => (
              <div key={feature.title} className="rounded-xl border bg-[hsl(210,40%,98%)] p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[hsl(217,91%,40%)]/10">
                  <feature.icon className="h-6 w-6 text-[hsl(217,91%,40%)]" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[hsl(222,47%,11%)]">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-[hsl(215,16%,47%)]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: "847+", label: "Loans Guaranteed" },
              { value: "TJS 125M+", label: "Total Disbursed" },
              { value: "6", label: "Partner Banks" },
              { value: "50+", label: "Bank Branches" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-[hsl(217,91%,40%)]">{stat.value}</p>
                <p className="mt-1 text-sm text-[hsl(215,16%,47%)]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-t bg-[hsl(0,0%,100%)] py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center gap-8 lg:flex-row">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-[hsl(222,47%,11%)]">Secure and Reliable</h2>
              <p className="mt-3 leading-relaxed text-[hsl(215,16%,47%)]">
                Built with enterprise-grade security including role-based access control, 
                audit trails, data encryption, and multi-language support for Tajikistan&apos;s 
                diverse financial ecosystem.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: Lock, text: "Role-based access control" },
                { icon: Shield, text: "Row-level security" },
                { icon: Globe, text: "Trilingual support (EN/RU/TJ)" },
                { icon: BarChart3, text: "Full audit trail" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3 rounded-lg border p-4">
                  <item.icon className="h-5 w-5 text-[hsl(217,91%,40%)]" />
                  <span className="text-sm font-medium text-[hsl(222,47%,11%)]">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-[hsl(222,47%,11%)] py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Emblem of Tajikistan" width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="text-sm font-medium text-[hsl(210,40%,98%)]">PRSF Loan Tracking MIS</span>
            </div>
            <p className="text-xs text-[hsl(215,20%,65%)]">
              Ministry of Finance of the Republic of Tajikistan. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
