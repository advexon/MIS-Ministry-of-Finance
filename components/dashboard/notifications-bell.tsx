'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { usePermissions } from '@/lib/contexts/permission-context'
import { Bell, CheckCheck, ShieldCheck, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { notificationHref } from '@/lib/notifications'
import { useCurrentTime } from '@/hooks/use-current-time'
import { notificationAge } from '@/lib/utils/display-time'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

export function NotificationsBell() {
  const uiText = useUiTranslation()

  const now = useCurrentTime()
  const [open, setOpen] = useState(false)
  const { user } = usePermissions()
  const userId: string | undefined = user?.id
  const supabase = createClient()
  const { data: notifications = [], error, isLoading, mutate } = useSWR<Notification[]>(
    userId ? ['notifications', userId] : null,
    async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, link, is_read, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
    { refreshInterval: 30000 },
  )

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifications-bell-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void mutate()
          toast.info('You have a new notification', { description: 'Open the notification bell to view it.' })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { void mutate() },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void mutate()
      })

    return () => { void supabase.removeChannel(channel) }
  }, [mutate, supabase, userId])

  const markAsRead = async (id: string) => {
    if (!userId) return
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('id', id)
      .select('id')
    if (error || !data?.length) {
      toast.error('Could not mark the notification as read')
      return
    }
    await mutate(current => current?.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllAsRead = async () => {
    if (!userId) return
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .in('id', unreadIds)
      .select('id')
    if (error || data?.length !== unreadIds.length) {
      toast.error('Could not mark all notifications as read')
      void mutate()
      return
    }
    await mutate(current => current?.map(n => unreadIds.includes(n.id) ? { ...n, is_read: true } : n))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const getIcon = (type: string) => {
    switch (type) {
      case 'report_submitted':
      case 'report_reviewed':
        return <ShieldCheck className="h-4 w-4 text-accent" />
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="sr-only">{uiText("Notifications")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{uiText("Notifications")}</h3>
            {unreadCount > 0 && (
              <span className="flex h-5 items-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />{uiText("Mark all read")}</Button>
          )}
        </div>

        {/* Notification List */}
        <ScrollArea className="max-h-[360px]">
          {error ? (
            <div className="flex flex-col gap-3 p-4" role="alert">
              <p className="text-sm text-destructive">{uiText("Could not load notifications.")}</p>
              <Button variant="outline" size="sm" onClick={() => { void mutate() }}>{uiText("Try again")}</Button>
            </div>
          ) : isLoading ? (
            <p className="p-4 text-sm text-muted-foreground" role="status">{uiText("Loading notifications…")}</p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">{uiText("No notifications yet")}</p>
            </div>
          ) : (
            <div className="py-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'group relative flex gap-3 px-4 py-3 transition-colors hover:bg-secondary/50',
                    !n.is_read && 'bg-accent/5'
                  )}
                >
                  {/* Unread dot */}
                  {!n.is_read && (
                    <span className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent" />
                  )}

                  {/* Icon */}
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
                    {getIcon(n.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-hidden">
                    <Link
                      href={notificationHref(n.link)}
                      onClick={() => { markAsRead(n.id); setOpen(false) }}
                      className="block"
                    >
                      <p className={cn(
                        'truncate text-xs leading-snug',
                        !n.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
                      )}>
                        {uiText(n.title)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {n.message}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        {notificationAge(n.created_at, now)}
                      </p>
                    </Link>
                  </div>

                  {/* Mark read button */}
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => markAsRead(n.id)}
                      aria-label={uiText('Mark {0} as read', uiText(n.title))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

      </DropdownMenuContent>
    </DropdownMenu>
  )
}
