'use client'

import { useId, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function AdminPasswordReset({ userId, name }: { userId: string; name: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function changeOpen(value: boolean) {
    if (saving) return
    setOpen(value)
    setPassword('')
    setConfirmation('')
    setError(null)
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirmation) {
      setError('Passwords do not match')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not reset password')
      setPassword('')
      setConfirmation('')
      setOpen(false)
      toast.success('Password reset', { description: 'Share the new password through an approved secure channel. No email was sent.' })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not reset password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><KeyRound data-icon="inline-start" />Reset password</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset user password</DialogTitle>
          <DialogDescription>Set a new password for {name}. Verify their identity and share it through an approved secure channel, not email.</DialogDescription>
        </DialogHeader>
        <form onSubmit={resetPassword} className="flex flex-col gap-4">
          <fieldset disabled={saving} className="flex flex-col gap-3">
            <legend className="sr-only">New account password</legend>
            <Label htmlFor={`${id}-password`}>New password</Label>
            <Input id={`${id}-password`} type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} />
            <Label htmlFor={`${id}-confirm`}>Confirm password</Label>
            <Input id={`${id}-confirm`} type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
          </fieldset>
          {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Resetting…' : 'Set new password'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
