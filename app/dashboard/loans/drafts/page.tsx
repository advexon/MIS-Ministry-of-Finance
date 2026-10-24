"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  FileEdit,
  Trash2,
  MoreVertical,
  Clock,
  AlertCircle,
  Search,
  Plus,
  ArrowLeft,
  RefreshCw,
  FileText,
  Calendar,
  Loader2,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import type { LoanDraft } from "@/lib/hooks/use-loan-draft"
import { useCurrentTime } from "@/hooks/use-current-time"
import { isExpiringSoon } from "@/lib/utils/display-time"
import { usePermissions } from "@/lib/contexts/permission-context"

export default function DraftsPage() {
  const now = useCurrentTime()
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = createClient()
  const { can } = usePermissions()
  const canCreateLoan = can("loans", "create")

  const [drafts, setDrafts] = useState<LoanDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<LoanDraft | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const loadDrafts = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("loan_drafts")
        .select("*")
        .eq("user_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .order("updated_at", { ascending: false })

      if (error) throw error
      setDrafts(data || [])
    } catch (error) {
      console.error("Failed to load drafts:", error)
      setMessage({ type: "error", text: "Failed to load drafts" })
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadDrafts()
  }, [loadDrafts])

  const handleDelete = async () => {
    if (!selectedDraft) return
    setIsDeleting(true)

    try {
      const { error } = await supabase
        .from("loan_drafts")
        .delete()
        .eq("id", selectedDraft.id)

      if (error) throw error

      setDrafts(prev => prev.filter(d => d.id !== selectedDraft.id))
      setMessage({ type: "success", text: "Draft deleted successfully" })
      setDeleteDialogOpen(false)
      setSelectedDraft(null)
    } catch (error) {
      console.error("Failed to delete draft:", error)
      setMessage({ type: "error", text: "Failed to delete draft" })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleContinue = (draft: LoanDraft) => {
    // Store draft ID in sessionStorage and redirect to form
    sessionStorage.setItem("loanDraftId", draft.id)
    router.push("/dashboard/loans/new")
  }

  const filteredDrafts = drafts.filter(draft => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      draft.draft_name.toLowerCase().includes(query) ||
      (draft.form_data.clientName || "").toLowerCase().includes(query) ||
      (draft.form_data.clientTin || "").includes(query)
    )
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale === "ru" ? "ru-RU" : locale === "tj" ? "tg-TJ" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getExpiryStatus = (expiresAt: string) => {
    const now = new Date()
    const expiry = new Date(expiresAt)
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysLeft <= 3) {
      return { status: "critical", label: `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, color: "text-destructive" }
    } else if (daysLeft <= 7) {
      return { status: "warning", label: `Expires in ${daysLeft} days`, color: "text-amber-600" }
    }
    return { status: "ok", label: `${daysLeft} days left`, color: "text-muted-foreground" }
  }

  const getStepLabel = (step: string) => {
    const labels: Record<string, string> = {
      borrower: "Borrower Info",
      legal_rep: "Legal Representative",
      loan: "Loan Details",
      collateral: "Collateral",
      additional: "Additional Info",
    }
    return labels[step] || step
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/loans">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Saved Drafts</h1>
            <p className="text-sm text-muted-foreground">
              Continue working on your saved loan applications
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadDrafts} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canCreateLoan && (
            <Button asChild>
              <Link href="/dashboard/loans/new">
                <Plus className="mr-2 h-4 w-4" />
                New Application
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"} className={message.type === "success" ? "border-green-500 bg-green-50" : ""}>
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription className={message.type === "success" ? "text-green-800" : ""}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Drafts</CardTitle>
            <FileEdit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{drafts.length}</div>
            <p className="text-xs text-muted-foreground">saved applications</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Near Completion</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {drafts.filter(d => d.completion_percentage >= 75).length}
            </div>
            <p className="text-xs text-muted-foreground">75%+ complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {now === null ? '…' : drafts.filter(d => isExpiringSoon(d.expires_at, now)).length}
            </div>
            <p className="text-xs text-muted-foreground">within 7 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search drafts by name or TIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Drafts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Draft</TableHead>
                <TableHead>Borrower</TableHead>
                <TableHead>Current Step</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredDrafts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {searchQuery ? "No drafts match your search" : "No saved drafts"}
                    </p>
                    {!searchQuery && (
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <Link href="/dashboard/loans/new">Start New Application</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDrafts.map((draft) => {
                  const expiry = getExpiryStatus(draft.expires_at)
                  return (
                    <TableRow key={draft.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <FileEdit className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{draft.draft_name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {draft.is_auto_saved && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  Auto-saved
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">
                            {draft.form_data.clientName || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            TIN: {draft.form_data.clientTin || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {getStepLabel(draft.current_step)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="w-32">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span>{draft.completion_percentage}%</span>
                          </div>
                          <Progress
                            value={draft.completion_percentage}
                            className="h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatDate(draft.updated_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-2 text-sm ${expiry.color}`}>
                          <Clock className="h-3.5 w-3.5" />
                          {expiry.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleContinue(draft)}
                          >
                            Continue
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setSelectedDraft(draft)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Draft
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Draft</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this draft? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedDraft && (
            <div className="rounded-lg border p-4 bg-muted/50">
              <p className="font-medium">{selectedDraft.draft_name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedDraft.form_data.clientName || "Untitled"} - {selectedDraft.completion_percentage}% complete
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
