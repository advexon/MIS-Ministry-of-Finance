'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const AuthorityReasonContext = createContext<() => Promise<string | null>>(async () => null)

export function AuthorityReasonProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const uiText = useUiTranslation()

  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const pending = useRef<{ resolve: (reason: string) => void; reject: (error: Error) => void } | null>(null)

  useEffect(() => () => {
    pending.current?.reject(new Error('Action cancelled'))
    pending.current = null
  }, [])

  function cancel() {
    pending.current?.reject(new Error('Action cancelled; nothing was submitted'))
    pending.current = null
    setOpen(false)
  }

  async function requestReason() {
    if (!enabled) return null
    if (pending.current) throw new Error('Complete the current authority confirmation first')
    setReason('')
    setOpen(true)
    return new Promise<string>((resolve, reject) => { pending.current = { resolve, reject } })
  }

  function confirm() {
    if (reason.trim().length < 3 || reason.trim().length > 2000) return
    pending.current?.resolve(reason.trim())
    pending.current = null
    setOpen(false)
  }

  return <AuthorityReasonContext.Provider value={requestReason}>
    {children}
    <Dialog open={open} onOpenChange={(value) => { if (!value) cancel() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{uiText("Use Super Administrator authority")}</DialogTitle><DialogDescription>{uiText("This action is performed as you, without impersonation. Explain why you are exercising exceptional authority. The reason is recorded with the action; evidence, amounts and workflow prerequisites still apply.")}</DialogDescription></DialogHeader>
        <div className="flex flex-col gap-2"><Label htmlFor="administrator-authority-reason">{uiText("Authority reason")}</Label><Textarea id="administrator-authority-reason" autoFocus maxLength={2000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <DialogFooter><Button variant="outline" onClick={cancel}>{uiText("Cancel action")}</Button><Button disabled={reason.trim().length < 3} onClick={confirm}>{uiText("Confirm attributable action")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </AuthorityReasonContext.Provider>
}

export function useAuthorityReason() { return useContext(AuthorityReasonContext) }
