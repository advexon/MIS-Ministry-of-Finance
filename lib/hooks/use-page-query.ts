'use client'

import useSWR from 'swr'
import { usePermissions } from '@/lib/contexts/permission-context'

export function usePageQuery<Data>(key: readonly unknown[] | null, fetcher: () => Promise<Data>) {
  const { user, role } = usePermissions()
  return useSWR(
    key === null ? null : ['dashboard', user.id, role?.id, ...key],
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
}
