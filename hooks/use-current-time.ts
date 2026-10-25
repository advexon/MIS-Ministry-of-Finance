'use client'

import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let currentTime: number | null = null
let timer: number | undefined

function updateTime() {
  currentTime = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  if (listeners.size === 1) {
    currentTime = Date.now()
    timer = window.setInterval(updateTime, 30_000)
  }

  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0) {
      window.clearInterval(timer)
      timer = undefined
      currentTime = null
    }
  }
}

function getSnapshot() {
  return currentTime
}

function getServerSnapshot() {
  return null
}

export function useCurrentTime() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
