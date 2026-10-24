'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Search,
  BookOpen,
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Settings,
  Shield,
  FolderDown,
  GitCompare,
  TrendingUp,
  ChevronRight,
  PlayCircle,
  CheckCircle2,
  Info,
  Lightbulb,
  HelpCircle,
} from 'lucide-react'

interface ManualSection {
  id: string
  titleKey: string
  icon: React.ElementType
  description: string
  content: {
    overview: string
    steps: { title: string; description: string }[]
    tips?: string[]
  }
}

const manualSections: ManualSection[] = [
  {
    id: 'getting-started',
    titleKey: 'Getting Started',
    icon: PlayCircle,
    description: 'Learn the basics of navigating and using the Credit Guarantee Fund MIS',
    content: {
      overview: 'The Credit Guarantee Fund Management Information System (MIS) is a comprehensive platform designed to manage loan guarantees, track borrower applications, process claims, and generate reports. This guide will help you understand how to use all features effectively.',
      steps: [
        {
          title: 'Login to Your Account',
          description: 'Access the system at the login page using your registered email and password. If you forgot your password, use the "Forgot Password" link to reset it.',
        },
        {
          title: 'Navigate the Dashboard',
          description: 'After logging in, you will see the main dashboard with key metrics, recent activities, and quick access to common tasks. Use the left sidebar to navigate between different modules.',
        },
        {
          title: 'Language Selection',
          description: 'Click the language dropdown in the top navigation bar to switch between English, Russian (Русский), and Tajik (Тоҷикӣ).',
        },
        {
          title: 'Profile Settings',
          description: 'Click on your profile avatar in the top right corner to access your profile settings, change password, or log out.',
        },
      ],
      tips: [
        'Use keyboard shortcut "/" to quickly access the search function',
        'Bookmark frequently used pages for faster access',
        'Check notifications regularly for important updates',
      ],
    },
  },
  {
    id: 'dashboard',
    titleKey: 'Dashboard Overview',
    icon: LayoutDashboard,
    description: 'Understanding the main dashboard and its key performance indicators',
    content: {
      overview: 'The Dashboard provides a real-time snapshot of your portfolio performance, including total loans, active guarantees, pending applications, and key financial metrics. Different user roles see different metrics based on their permissions.',
      steps: [
        {
          title: 'Portfolio Summary Cards',
          description: 'View total loans, active loans, total disbursed amounts, and guaranteed amounts at a glance. Click on any card to see detailed breakdowns.',
        },
        {
          title: 'Charts and Visualizations',
          description: 'Interactive charts show portfolio distribution by status, sector, and bank. Hover over chart elements for detailed information.',
        },
        {
          title: 'Recent Activity Feed',
          description: 'Track recent loan applications, status changes, and system events. Click on any activity item to view full details.',
        },
        {
          title: 'Upcoming Deadlines',
          description: 'Monitor approaching deadlines for loan reviews, guarantee expirations, and report submissions.',
        },
      ],
      tips: [
        'Dashboard data refreshes automatically every 5 minutes',
        'Use date filters to view historical performance',
        'Export dashboard data for offline analysis',
      ],
    },
  },
  {
    id: 'loan-applications',
    titleKey: 'Loan Applications',
    icon: FileText,
    description: 'How to submit, review, and manage loan guarantee applications',
    content: {
      overview: 'The Loan Applications module is the core of the system where banks submit new loan guarantee requests and PRSF staff review and approve them. Each application goes through multiple stages from submission to final approval.',
      steps: [
        {
          title: 'Submit New Application',
          description: 'Click "New Loan Application" button. Fill in borrower details, loan information, collateral details, and upload required documents. Save as draft or submit for review.',
        },
        {
          title: 'Application Workflow',
          description: 'Applications flow through stages: Draft → Submitted → Under Review → Bank Approved → PRSF Review → Approved/Rejected. Each stage requires specific actions.',
        },
        {
          title: 'Required Documents',
          description: 'Upload business registration, financial statements, tax returns, collateral documents, and loan agreement. Ensure all documents are clearly scanned.',
        },
        {
          title: 'Track Application Status',
          description: 'Use the search and filter options to find applications. Click on any application to view its current status, history, and any pending actions.',
        },
        {
          title: 'Application Review (PRSF Staff)',
          description: 'Review submitted applications, verify documents, check eligibility criteria, and make approval decisions with comments.',
        },
      ],
      tips: [
        'Save applications as drafts to complete later',
        'Use application templates for common loan types',
        'Attach clear, legible document scans',
        'Monitor the notification bell for in-app status updates',
      ],
    },
  },
  {
    id: 'borrowers',
    titleKey: 'Borrower Management',
    icon: Users,
    description: 'Managing borrower profiles and their loan history',
    content: {
      overview: 'The Borrowers module maintains a comprehensive database of all borrowers who have applied for or received loan guarantees. Track their profiles, loan history, and compliance status.',
      steps: [
        {
          title: 'Add New Borrower',
          description: 'Register new borrowers with their business details, contact information, TIN/registration numbers, and sector classification.',
        },
        {
          title: 'Borrower Profile',
          description: 'View complete borrower information including business type, ownership structure, financial history, and all associated loans.',
        },
        {
          title: 'Loan History',
          description: 'Track all loan applications made by a borrower, their status, repayment history, and any claims filed.',
        },
        {
          title: 'Document Repository',
          description: 'Access all documents submitted by the borrower across different applications in one centralized location.',
        },
      ],
      tips: [
        'Keep borrower information up to date',
        'Check borrower history before approving new applications',
        'Use the search function to quickly find borrowers',
      ],
    },
  },
  {
    id: 'banks',
    titleKey: 'Partner Banks',
    icon: Building2,
    description: 'Managing partner bank relationships and their portfolios',
    content: {
      overview: 'The Banks module manages all partner financial institutions, their branches, staff, and portfolio performance. Track each bank\'s guarantee utilization and compliance.',
      steps: [
        {
          title: 'Bank Profiles',
          description: 'View and manage partner bank information including contact details, branch network, and key personnel.',
        },
        {
          title: 'Branch Management',
          description: 'Track individual branch performance, assigned loan officers, and regional distribution of guarantees.',
        },
        {
          title: 'Portfolio Analysis',
          description: 'Analyze each bank\'s guarantee portfolio including disbursements, outstanding amounts, and delinquency rates.',
        },
        {
          title: 'Compliance Monitoring',
          description: 'Monitor bank compliance with guarantee program requirements and reporting deadlines.',
        },
      ],
      tips: [
        'Review bank performance quarterly',
        'Track branch-level delinquency patterns',
        'Ensure all bank contacts are current',
      ],
    },
  },
  {
    id: 'claims',
    titleKey: 'Claims Processing',
    icon: AlertTriangle,
    description: 'Filing and processing guarantee claims',
    content: {
      overview: 'When a guaranteed loan defaults, banks can file claims against the guarantee. This module manages the entire claims process from filing through payment.',
      steps: [
        {
          title: 'File New Claim',
          description: 'Submit a claim request by selecting the defaulted loan, providing default details, uploading supporting documentation, and specifying the claim amount.',
        },
        {
          title: 'Claim Review Process',
          description: 'Claims go through verification of default conditions, document review, and eligibility check before approval.',
        },
        {
          title: 'Claim Calculation',
          description: 'System automatically calculates the eligible claim amount based on guarantee coverage percentage and outstanding principal.',
        },
        {
          title: 'Claim Payment',
          description: 'Approved claims are processed for payment according to the guarantee agreement terms.',
        },
        {
          title: 'Recovery Tracking',
          description: 'After claim payment, track any recovery efforts and amounts recovered from the borrower.',
        },
      ],
      tips: [
        'File claims promptly after default',
        'Include all required documentation',
        'Track claim status regularly',
        'Document all recovery efforts',
      ],
    },
  },
  {
    id: 'fees',
    titleKey: 'Fees & Commissions',
    icon: DollarSign,
    description: 'Managing guarantee fees and commission calculations',
    content: {
      overview: 'The Fees module calculates and tracks guarantee fees charged to partner banks. Fees are typically calculated as a percentage of the guaranteed amount.',
      steps: [
        {
          title: 'Fee Calculation',
          description: 'System automatically calculates fees based on loan amount, guarantee coverage, and applicable fee rates.',
        },
        {
          title: 'Invoice Generation',
          description: 'Generate fee invoices for partner banks based on their active guarantees.',
        },
        {
          title: 'Payment Tracking',
          description: 'Track fee payments received and outstanding balances by bank.',
        },
        {
          title: 'Fee Reports',
          description: 'Generate reports on fee income by period, bank, and product type.',
        },
      ],
      tips: [
        'Review fee schedules periodically',
        'Follow up on overdue payments',
        'Reconcile fee accounts monthly',
      ],
    },
  },
  {
    id: 'reports',
    titleKey: 'Reports & Analytics',
    icon: BarChart3,
    description: 'Generating and exporting system reports',
    content: {
      overview: 'The Reports module provides comprehensive reporting capabilities including standard reports, custom queries, and data exports for analysis and compliance.',
      steps: [
        {
          title: 'Standard Reports',
          description: 'Access pre-built reports including portfolio summary, disbursement reports, delinquency analysis, and financial statements.',
        },
        {
          title: 'Custom Reports',
          description: 'Build custom reports by selecting data fields, filters, and groupings to meet specific analytical needs.',
        },
        {
          title: 'Scheduled Reports',
          description: 'Set up automatic report generation and email delivery on daily, weekly, or monthly schedules.',
        },
        {
          title: 'Export Options',
          description: 'Export reports in multiple formats including Excel, PDF, and CSV for further analysis.',
        },
      ],
      tips: [
        'Use filters to narrow report data',
        'Schedule regular reports for stakeholders',
        'Archive important reports for compliance',
      ],
    },
  },
  {
    id: 'guarantee-reports',
    titleKey: 'Guarantee Reports',
    icon: Shield,
    description: 'Submitting monthly guarantee reports to PRSF',
    content: {
      overview: 'Partner banks submit monthly reports on their guaranteed loan portfolios. These reports are reviewed by PRSF staff to monitor portfolio health and compliance.',
      steps: [
        {
          title: 'Create Monthly Report',
          description: 'Start a new monthly report by selecting the reporting period. System pre-populates loan data from active guarantees.',
        },
        {
          title: 'Verify Loan Data',
          description: 'Review and update loan balances, payment status, and any changes since the last report.',
        },
        {
          title: 'Add New Disbursements',
          description: 'Include any new loan disbursements made during the reporting period with full details.',
        },
        {
          title: 'Submit for Review',
          description: 'After verification, submit the report for PRSF review. You can save as draft to complete later.',
        },
        {
          title: 'Address Review Comments',
          description: 'If PRSF requests revisions, make the necessary corrections and resubmit.',
        },
      ],
      tips: [
        'Submit reports before the deadline',
        'Double-check all figures before submission',
        'Keep supporting documentation ready',
        'Monitor report status after submission',
      ],
    },
  },
  {
    id: 'documents',
    titleKey: 'Document Center',
    icon: FolderDown,
    description: 'Managing and organizing documents',
    content: {
      overview: 'The Document Center serves as a central repository for all system documents including loan agreements, guarantee certificates, compliance documents, and templates.',
      steps: [
        {
          title: 'Upload Documents',
          description: 'Upload new documents by selecting the document type, entering metadata, and attaching the file.',
        },
        {
          title: 'Document Organization',
          description: 'Documents are automatically organized by type, date, and associated entities (loans, borrowers, banks).',
        },
        {
          title: 'Search and Filter',
          description: 'Use powerful search and filter options to quickly find specific documents.',
        },
        {
          title: 'Document Templates',
          description: 'Access standardized templates for common documents like guarantee certificates and agreements.',
        },
      ],
      tips: [
        'Use descriptive file names',
        'Tag documents for easier searching',
        'Keep originals in secure storage',
      ],
    },
  },
  {
    id: 'reconciliation',
    titleKey: 'Reconciliation',
    icon: GitCompare,
    description: 'Reconciling data between systems',
    content: {
      overview: 'The Reconciliation module helps match and verify data between the MIS and external systems including bank core systems and accounting records.',
      steps: [
        {
          title: 'Data Import',
          description: 'Import data files from bank systems in standard formats for comparison.',
        },
        {
          title: 'Automatic Matching',
          description: 'System automatically matches records based on loan numbers and other identifiers.',
        },
        {
          title: 'Exception Handling',
          description: 'Review and resolve mismatched records with detailed comparison views.',
        },
        {
          title: 'Reconciliation Reports',
          description: 'Generate reports showing matched, unmatched, and discrepancy records.',
        },
      ],
      tips: [
        'Run reconciliation regularly',
        'Investigate discrepancies promptly',
        'Document resolution of exceptions',
      ],
    },
  },
  {
    id: 'recoveries',
    titleKey: 'Recovery Tracking',
    icon: TrendingUp,
    description: 'Tracking loan recovery efforts and results',
    content: {
      overview: 'After claim payment, track recovery efforts to recoup funds from defaulted borrowers. This module records all recovery activities and amounts.',
      steps: [
        {
          title: 'Recovery Case Management',
          description: 'Create and manage recovery cases for loans with paid claims.',
        },
        {
          title: 'Recovery Actions',
          description: 'Log all recovery actions taken including demand letters, legal proceedings, and asset seizures.',
        },
        {
          title: 'Payment Recording',
          description: 'Record any amounts recovered from the borrower or liquidation of collateral.',
        },
        {
          title: 'Recovery Analytics',
          description: 'Analyze recovery rates, time to recovery, and effectiveness of different recovery methods.',
        },
      ],
      tips: [
        'Document all recovery efforts',
        'Track recovery costs separately',
        'Review recovery strategies periodically',
      ],
    },
  },
  {
    id: 'audit-trail',
    titleKey: 'Audit Trail',
    icon: Shield,
    description: 'Viewing system activity and audit logs',
    content: {
      overview: 'The Audit Trail maintains a complete log of all system activities for compliance and security purposes. Track who did what and when.',
      steps: [
        {
          title: 'View Activity Logs',
          description: 'Browse chronological logs of all system activities including logins, data changes, and approvals.',
        },
        {
          title: 'Filter by User',
          description: 'View activities by specific users to track individual actions.',
        },
        {
          title: 'Filter by Entity',
          description: 'View all changes made to specific loans, borrowers, or other entities.',
        },
        {
          title: 'Export Audit Data',
          description: 'Export audit logs for compliance reporting and external audits.',
        },
      ],
      tips: [
        'Review audit logs regularly',
        'Investigate unusual activities',
        'Archive logs per retention policy',
      ],
    },
  },
  {
    id: 'settings',
    titleKey: 'System Settings',
    icon: Settings,
    description: 'Configuring system preferences and user management',
    content: {
      overview: 'The Settings module allows administrators to configure system parameters, manage users, and customize the application behavior.',
      steps: [
        {
          title: 'User Profile',
          description: 'Update your personal information, change password, and configure notification preferences.',
        },
        {
          title: 'User Management (Admin)',
          description: 'Create new users, assign roles, manage permissions, and deactivate accounts.',
        },
        {
          title: 'System Configuration (Admin)',
          description: 'Configure fee rates, approval workflows, notification settings, and other system parameters.',
        },
        {
          title: 'Data Management (Admin)',
          description: 'Manage reference data including sectors, loan products, and status codes.',
        },
      ],
      tips: [
        'Use strong passwords',
        'Review user access periodically',
        'Test configuration changes in draft mode',
      ],
    },
  },
]

export default function UserManualPage() {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSection, setSelectedSection] = useState<string | null>('getting-started')

  const filteredSections = manualSections.filter(
    (section) =>
      section.titleKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.content.overview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const currentSection = manualSections.find((s) => s.id === selectedSection)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">User Manual</h1>
            <p className="text-sm text-muted-foreground">
              Comprehensive guide to using the Credit Guarantee Fund MIS
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="hidden w-72 flex-shrink-0 border-r bg-muted/30 lg:block">
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search manual..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-220px)]">
            <nav className="space-y-1 p-2">
              {filteredSections.map((section) => {
                const Icon = section.icon
                const isActive = selectedSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{section.titleKey}</span>
                  </button>
                )
              })}
            </nav>
          </ScrollArea>
        </aside>

        {/* Mobile Section Selector */}
        <div className="border-b p-4 lg:hidden">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search manual..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {filteredSections.map((section) => {
                const Icon = section.icon
                const isActive = selectedSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className={cn(
                      'flex flex-shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {section.titleKey}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-3xl p-6">
              {currentSection ? (
                <>
                  {/* Section Header */}
                  <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <BookOpen className="h-4 w-4" />
                      <ChevronRight className="h-3 w-3" />
                      <span>{currentSection.titleKey}</span>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <currentSection.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">{currentSection.titleKey}</h2>
                        <p className="mt-1 text-muted-foreground">{currentSection.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Overview */}
                  <Card className="mb-6">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        <CardTitle className="text-base">Overview</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {currentSection.content.overview}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Step by Step Guide */}
                  <Card className="mb-6">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <PlayCircle className="h-4 w-4 text-green-500" />
                        <CardTitle className="text-base">Step-by-Step Guide</CardTitle>
                      </div>
                      <CardDescription>Follow these steps to use this feature effectively</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible className="w-full">
                        {currentSection.content.steps.map((step, index) => (
                          <AccordionItem key={index} value={`step-${index}`}>
                            <AccordionTrigger className="hover:no-underline">
                              <div className="flex items-center gap-3">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                                  {index + 1}
                                </div>
                                <span className="text-sm font-medium">{step.title}</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <p className="pl-9 text-sm text-muted-foreground">{step.description}</p>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>

                  {/* Tips */}
                  {currentSection.content.tips && currentSection.content.tips.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-yellow-500" />
                          <CardTitle className="text-base">Tips & Best Practices</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {currentSection.content.tips.map((tip, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                              <span className="text-muted-foreground">{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Help Footer */}
                  <div className="mt-8 rounded-lg border bg-muted/50 p-4">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <h4 className="text-sm font-medium">Need more help?</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Contact your system administrator or reach out to PRSF support for additional assistance.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-medium">Select a Section</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose a topic from the sidebar to view its documentation
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  )
}
