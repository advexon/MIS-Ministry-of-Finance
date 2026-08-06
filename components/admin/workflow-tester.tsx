"use client"

import { useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Shield, Play, RotateCcw, ChevronRight, CheckCircle2, XCircle,
  AlertTriangle, Banknote, FileCheck, Clock, User, Building2,
  RefreshCw, TrendingDown, Lock, Unlock, Eye, History
} from "lucide-react"
import type { LoanApplication } from "@/lib/types/database"

// Complete workflow status transitions
const WORKFLOW_TRANSITIONS: Record<string, { next: string[]; role: string; label: string; icon: React.ElementType; color: string }> = {
  draft: { 
    next: ["submitted"], 
    role: "bank", 
    label: "Submit Application",
    icon: Play,
    color: "bg-amber-500"
  },
  submitted: { 
    next: ["under_review"], 
    role: "prsf", 
    label: "Mark as Received",
    icon: Eye,
    color: "bg-blue-500"
  },
  under_review: { 
    next: ["approved", "rejected"], 
    role: "prsf", 
    label: "Make Decision",
    icon: FileCheck,
    color: "bg-sky-500"
  },
  approved: { 
    next: ["guarantee_issued", "extension_pending", "cancelled"], 
    role: "prsf", 
    label: "Issue Guarantee / Cancel",
    icon: Shield,
    color: "bg-teal-500"
  },
  extension_pending: { 
    next: ["approved", "cancelled"], 
    role: "prsf", 
    label: "Handle Extension",
    icon: Clock,
    color: "bg-yellow-500"
  },
  guarantee_issued: { 
    next: ["disbursed", "cancelled"], 
    role: "bank", 
    label: "Record Disbursement",
    icon: Banknote,
    color: "bg-indigo-500"
  },
  disbursed: { 
    next: ["active", "settled", "rescheduled", "defaulted"], 
    role: "bank", 
    label: "Update Loan Status",
    icon: RefreshCw,
    color: "bg-emerald-500"
  },
  active: { 
    next: ["settled", "rescheduled", "defaulted"], 
    role: "bank", 
    label: "Record Outcome",
    icon: CheckCircle2,
    color: "bg-emerald-500"
  },
  rescheduled: { 
    next: ["settled", "defaulted"], 
    role: "bank", 
    label: "Final Outcome",
    icon: RefreshCw,
    color: "bg-orange-500"
  },
  defaulted: { 
    next: ["claim_pending"], 
    role: "bank", 
    label: "File Claim",
    icon: AlertTriangle,
    color: "bg-red-500"
  },
  claim_pending: { 
    next: ["claim_paid", "claim_rejected"], 
    role: "prsf", 
    label: "Review Claim",
    icon: FileCheck,
    color: "bg-rose-500"
  },
  claim_paid: { 
    next: ["closed"], 
    role: "prsf", 
    label: "Close After Recoveries",
    icon: Banknote,
    color: "bg-purple-500"
  },
  // Terminal states
  rejected: { next: [], role: "none", label: "End of Process", icon: XCircle, color: "bg-red-500" },
  cancelled: { next: [], role: "none", label: "End of Process", icon: XCircle, color: "bg-red-500" },
  settled: { next: [], role: "none", label: "End of Process", icon: CheckCircle2, color: "bg-emerald-500" },
  claim_rejected: { next: [], role: "none", label: "End of Process", icon: XCircle, color: "bg-red-500" },
  closed: { next: [], role: "none", label: "End of Process", icon: CheckCircle2, color: "bg-gray-500" },
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  guarantee_issued: "Guarantee Issued",
  extension_pending: "Extension Pending",
  cancelled: "Cancelled",
  disbursed: "Disbursed",
  active: "Active",
  defaulted: "Defaulted",
  settled: "Settled",
  rescheduled: "Rescheduled",
  claim_pending: "Claim Pending",
  claim_rejected: "Claim Rejected",
  claim_paid: "Claim Paid",
  closed: "Closed",
}

const ROLE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  bank: { label: "Bank Officer", icon: Building2, color: "text-blue-600" },
  prsf: { label: "PRSF Analyst", icon: Shield, color: "text-emerald-600" },
  none: { label: "No Action", icon: Lock, color: "text-gray-400" },
}

// All possible statuses for direct jump
const ALL_STATUSES = [
  "draft", "submitted", "under_review", "approved", "rejected",
  "guarantee_issued", "extension_pending", "cancelled", "disbursed",
  "active", "defaulted", "settled", "rescheduled", "claim_pending",
  "claim_rejected", "claim_paid", "closed"
]

interface WorkflowTesterProps {
  loan: LoanApplication
  onStatusChange: () => void
}

export function WorkflowTester({ loan, onStatusChange }: WorkflowTesterProps) {
  const supabase = createClient()
  const [simulatedRole, setSimulatedRole] = useState<"bank" | "prsf">("prsf")
  const [transitioning, setTransitioning] = useState(false)
  const [jumpToStatus, setJumpToStatus] = useState<string>("")
  const [testNotes, setTestNotes] = useState("")
  const [actionLog, setActionLog] = useState<Array<{ time: Date; action: string; from: string; to: string }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  const currentStatus = loan.status || "draft"
  const currentTransition = WORKFLOW_TRANSITIONS[currentStatus]

  // Perform status transition
  const performTransition = useCallback(async (newStatus: string, isJump = false) => {
    setTransitioning(true)
    setTransitionError(null)
    try {
      const updateData: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      // Add timestamp fields based on status
      if (newStatus === "approved") updateData.loan_approval_date = new Date().toISOString()
      if (newStatus === "disbursed") updateData.disbursement_date = new Date().toISOString()
      if (newStatus === "settled") updateData.settlement_date = new Date().toISOString()

      const { error } = await supabase
        .from("loan_applications")
        .update(updateData)
        .eq("id", loan.id)

      if (error) throw error

      // Log the action
      setActionLog(prev => [{
        time: new Date(),
        action: isJump ? `Direct Jump (Superadmin)` : `Workflow Transition`,
        from: currentStatus,
        to: newStatus,
      }, ...prev])

      onStatusChange()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error during transition"
      setTransitionError(`Could not move from "${STATUS_LABELS[currentStatus] ?? currentStatus}" to "${STATUS_LABELS[newStatus] ?? newStatus}": ${message}`)
    } finally {
      setTransitioning(false)
    }
  }, [supabase, loan.id, currentStatus, onStatusChange])

  // Reset to draft
  const resetToDraft = useCallback(async () => {
    if (!confirm("Reset this loan to Draft status? This is for testing purposes only.")) return
    await performTransition("draft", true)
  }, [performTransition])

  const isTerminal = !currentTransition?.next?.length

  return (
    <Card className="border-2 border-dashed border-amber-300 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-100">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Superadmin Workflow Tester
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                  Testing Mode
                </Badge>
              </CardTitle>
              <CardDescription>
                Full access to simulate and test all workflow stages
              </CardDescription>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="gap-1"
          >
            <History className="h-4 w-4" />
            {actionLog.length > 0 && <Badge variant="secondary" className="h-5 px-1.5">{actionLog.length}</Badge>}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Transition failure feedback */}
        {transitionError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between gap-3">
              <span>{transitionError}</span>
              <button
                type="button"
                onClick={() => setTransitionError(null)}
                className="shrink-0 underline underline-offset-2"
              >
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Current Status Display */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentTransition?.color || 'bg-gray-500'}`}>
              {currentTransition?.icon && <currentTransition.icon className="h-4 w-4 text-white" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Status</p>
              <p className="font-semibold">{STATUS_LABELS[currentStatus]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isTerminal && (
              <Badge variant="outline" className={`${ROLE_LABELS[currentTransition?.role || 'none'].color}`}>
                <User className="h-3 w-3 mr-1" />
                Requires: {ROLE_LABELS[currentTransition?.role || 'none'].label}
              </Badge>
            )}
            {isTerminal && (
              <Badge variant="secondary">
                <Lock className="h-3 w-3 mr-1" />
                Terminal State
              </Badge>
            )}
          </div>
        </div>

        {/* Role Simulator */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Simulate As Role</Label>
            <Select value={simulatedRole} onValueChange={(v) => setSimulatedRole(v as "bank" | "prsf")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    Bank Officer
                  </span>
                </SelectItem>
                <SelectItem value="prsf">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-600" />
                    PRSF Analyst
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Direct Jump To Status</Label>
            <div className="flex gap-2">
              <Select value={jumpToStatus} onValueChange={setJumpToStatus}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(status => (
                    <SelectItem key={status} value={status} disabled={status === currentStatus}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                size="icon"
                variant="outline"
                disabled={!jumpToStatus || transitioning}
                onClick={() => {
                  performTransition(jumpToStatus, true)
                  setJumpToStatus("")
                }}
              >
                <Play className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Available Transitions */}
        {!isTerminal && currentTransition?.next && currentTransition.next.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-2">
              <ChevronRight className="h-3 w-3" />
              Available Workflow Transitions
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {currentTransition.next.map(nextStatus => {
                const nextDef = WORKFLOW_TRANSITIONS[nextStatus]
                const NextIcon = nextDef?.icon || ChevronRight
                const roleMatch = simulatedRole === currentTransition.role
                
                return (
                  <TooltipProvider key={nextStatus}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={roleMatch ? "default" : "outline"}
                          className={`justify-start gap-2 ${!roleMatch ? 'opacity-50' : ''}`}
                          disabled={transitioning}
                          onClick={() => performTransition(nextStatus)}
                        >
                          <NextIcon className="h-4 w-4" />
                          {STATUS_LABELS[nextStatus]}
                          {!roleMatch && <Lock className="h-3 w-3 ml-auto" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {roleMatch 
                          ? `Transition to ${STATUS_LABELS[nextStatus]}`
                          : `Requires ${ROLE_LABELS[currentTransition.role].label} role`
                        }
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              })}
            </div>
          </div>
        )}

        {/* Terminal State Actions */}
        {isTerminal && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              This loan is in a terminal state ({STATUS_LABELS[currentStatus]}). 
              Use the Reset button below or Direct Jump to continue testing.
            </AlertDescription>
          </Alert>
        )}

        {/* Test Notes */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Test Notes (optional)</Label>
          <Textarea 
            value={testNotes}
            onChange={(e) => setTestNotes(e.target.value)}
            placeholder="Add notes about this test scenario..."
            className="h-16 text-sm"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <Button 
            variant="destructive" 
            size="sm"
            onClick={resetToDraft}
            disabled={transitioning || currentStatus === "draft"}
            className="gap-1"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Draft
          </Button>
          <div className="text-xs text-muted-foreground">
            Loan #{loan.loan_number || loan.id?.slice(0, 8)}
          </div>
        </div>

        {/* Action History */}
        {showHistory && actionLog.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-2">
                <History className="h-3 w-3" />
                Test Action History
              </Label>
              <ScrollArea className="h-32 rounded-md border p-2">
                <div className="space-y-2">
                  {actionLog.map((log, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-16 shrink-0">
                        {log.time.toLocaleTimeString()}
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {STATUS_LABELS[log.from]}
                      </Badge>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="secondary" className="shrink-0">
                        {STATUS_LABELS[log.to]}
                      </Badge>
                      <span className="text-muted-foreground truncate">{log.action}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
