import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  FileText,
  Globe,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"

/* Programme figures shown in the hero register */
const register = [
  { label: "Partner financial institutions", value: "15" },
  { label: "Guarantees under management", value: "$50M+" },
  { label: "Standard coverage ratio", value: "50%" },
  { label: "Operating languages", value: "3" },
]

/* The real guarantee lifecycle enforced by the system */
const lifecycle = [
  { stage: "Draft", note: "Prepared by the partner bank" },
  { stage: "Submitted", note: "Lodged with the Fund" },
  { stage: "Under review", note: "Appraisal and due diligence" },
  { stage: "Approved", note: "Credit decision recorded" },
  { stage: "Guarantee issued", note: "Letter of Guarantee executed" },
  { stage: "Disbursed", note: "Funds released to borrower" },
  { stage: "Active", note: "Servicing and monitoring" },
  { stage: "Settled", note: "Obligation discharged" },
]

const capabilities = [
  {
    Icon: FileText,
    title: "Guarantee administration",
    desc: "Applications tracked from lodgement through approval, issuance and disbursement, with an immutable audit trail on every state change.",
  },
  {
    Icon: BarChart3,
    title: "Portfolio supervision",
    desc: "Exposure, utilisation against bank limits, and arrears concentration reported on demand for management and oversight bodies.",
  },
  {
    Icon: Building2,
    title: "Institution register",
    desc: "Participating banks, their branch networks and allocated guarantee ceilings maintained in a single authoritative record.",
  },
  {
    Icon: Users,
    title: "Delegated authority",
    desc: "Six defined roles spanning Fund staff, partner banks and auditors, each constrained to the actions of its mandate.",
  },
  {
    Icon: Globe,
    title: "Trilingual operation",
    desc: "The full interface, correspondence and generated instruments are available in Tajik, Russian and English.",
  },
  {
    Icon: ShieldCheck,
    title: "Claims and recovery",
    desc: "Default notices, claim assessment and post-payment recovery handled within the same governed workflow.",
  },
]

const controls = [
  "Row-level security on every table",
  "Role-based access control",
  "Full audit logging of all changes",
  "Encryption in transit and at rest",
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Official designation strip */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-6">
          <p className="truncate text-[11px] uppercase tracking-[0.14em] text-primary-foreground/80">
            Ministry of Finance <span className="hidden sm:inline">&mdash; Republic of</span> Tajikistan
          </p>
          <p className="hidden items-center gap-2 text-[11px] text-primary-foreground/70 sm:flex">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Restricted system &mdash; authorised users only
          </p>
        </div>
      </div>

      {/* Masthead */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6 sm:h-20">
          <Link href="/" className="flex min-w-0 items-center gap-3 sm:gap-3.5">
            <Image
              src="/logo.png"
              alt="Credit Guarantee Fund"
              width={44}
              height={44}
              className="h-9 w-9 shrink-0 object-contain sm:h-11 sm:w-11"
              priority
            />
            <span className="min-w-0 sm:border-l sm:border-border sm:pl-3.5">
              <span className="block truncate font-serif text-base font-semibold leading-tight tracking-tight sm:text-lg">
                Credit Guarantee Fund
              </span>
              <span className="hidden text-[11px] uppercase tracking-[0.12em] text-muted-foreground sm:block">
                Management Information System
              </span>
            </span>
          </Link>
          <Button size="sm" asChild className="gap-2">
            <Link href="/auth/login">
              Sign in
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero — asymmetric: statement left, programme register right */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-12 lg:gap-16 lg:py-24">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-accent" aria-hidden="true" />
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
                Private Sector Recovery Facility
              </span>
            </div>

            <h1 className="mt-6 font-serif text-4xl font-semibold leading-[1.12] tracking-tight text-balance lg:text-[3.25rem]">
              Sovereign credit guarantees, administered on the public record.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              The Fund underwrites a share of MSME lending risk for participating banks in
              Tajikistan. This system is the register of record for every guarantee it
              issues &mdash; from application through settlement or claim.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Button size="lg" asChild className="gap-2">
                <Link href="/auth/login">
                  Access the system
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Credentials are issued by the Fund secretariat.
              </p>
            </div>
          </div>

          {/* Programme register — load-bearing figures, set as a document table */}
          <div className="lg:col-span-5">
            <div className="border border-border bg-card">
              <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5">
                <h2 className="font-serif text-sm font-semibold tracking-tight">
                  Programme at a glance
                </h2>
                <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Reference
                </span>
              </div>
              <dl>
                {register.map((row, i) => (
                  <div
                    key={row.label}
                    className={`flex items-baseline justify-between gap-4 px-5 py-4 ${
                      i !== register.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="font-serif text-2xl font-semibold tabular-nums leading-none text-primary">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-border bg-muted/40 px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                Indicative programme parameters. Operational figures are available to
                authorised users within the dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Lifecycle — the signature element, and a genuine sequence */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl font-semibold tracking-tight lg:text-3xl">
              One governed path, eight recorded stages
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Every guarantee advances through the same controlled sequence. Transitions are
              validated by the system and attributed to a named officer.
            </p>
          </div>

          <ol className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {lifecycle.map((step, i) => (
              <li key={step.stage}>
                <div className="flex items-center gap-2 border-t-2 border-primary pt-3">
                  <span className="font-serif text-sm font-semibold tabular-nums text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold leading-snug">{step.stage}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {step.note}
                </p>
              </li>
            ))}
          </ol>

          <p className="mt-10 border-t border-border pt-5 text-sm text-muted-foreground">
            Exception paths &mdash; rejection, cancellation, rescheduling, extension, default
            and claim &mdash; are modelled explicitly and subject to the same controls.
          </p>
        </div>
      </section>

      {/* Capabilities — spec sheet, not card grid */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="flex flex-col gap-3 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
            <h2 className="font-serif text-2xl font-semibold tracking-tight lg:text-3xl">
              Functional scope
            </h2>
            <p className="text-sm text-muted-foreground">
              Six operating areas, one authoritative record.
            </p>
          </div>

          <div className="grid md:grid-cols-2 md:gap-x-12">
            {capabilities.map((item, i) => (
              <div
                key={item.title}
                className={`flex gap-4 border-b border-border py-7 ${
                  i >= capabilities.length - 2 ? "md:border-b-0" : ""
                }`}
              >
                <item.Icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-serif text-base font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Governance */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-12 lg:gap-16 lg:py-20">
          <div className="lg:col-span-6">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-primary-foreground/40" aria-hidden="true" />
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-foreground/70">
                Governance
              </span>
            </div>
            <h2 className="mt-6 font-serif text-2xl font-semibold tracking-tight text-balance lg:text-3xl">
              Public money demands a defensible record.
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-primary-foreground/75">
              Access is granted strictly by mandate and every action is attributable. The
              register is built to withstand external audit and to evidence the Fund&apos;s
              exposure at any point in time.
            </p>
          </div>

          <div className="lg:col-span-6 lg:pl-16">
            <ul className="border-t border-primary-foreground/15">
              {controls.map((control) => (
                <li
                  key={control}
                  className="flex items-center gap-3 border-b border-primary-foreground/15 py-4"
                >
                  <Check
                    className="h-4 w-4 shrink-0 text-primary-foreground/60"
                    aria-hidden="true"
                  />
                  <span className="text-sm text-primary-foreground/90">{control}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Access */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="flex flex-col items-start justify-between gap-8 border border-border bg-card p-8 md:flex-row md:items-center lg:p-10">
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight lg:text-2xl">
                Sign in to the register
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Available to Fund staff, authorised officers of partner banks, and appointed
                auditors. If you require access, contact the Fund secretariat.
              </p>
            </div>
            <Button size="lg" asChild className="shrink-0 gap-2">
              <Link href="/auth/login">
                Sign in
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
                <span className="font-serif text-base font-semibold tracking-tight">
                  Credit Guarantee Fund
                </span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Established under the Ministry of Finance of the Republic of Tajikistan to
                expand access to finance for micro, small and medium enterprises.
              </p>
            </div>

            <div className="md:col-span-3">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                System
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                <li>
                  <Link
                    href="/auth/login"
                    className="text-sm text-foreground/80 transition-colors hover:text-primary"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-foreground/80 transition-colors hover:text-primary"
                  >
                    Reset password
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-4">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Secretariat
              </h3>
              <address className="mt-4 not-italic text-sm leading-relaxed text-muted-foreground">
                Ministry of Finance
                <br />
                Dushanbe, Republic of Tajikistan
                <br />
                <a
                  href="mailto:prsf@minfin.tj"
                  className="text-foreground/80 transition-colors hover:text-primary"
                >
                  prsf@minfin.tj
                </a>
              </address>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Credit Guarantee Fund. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground">
              Private Sector Recovery Facility &mdash; Management Information System
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
