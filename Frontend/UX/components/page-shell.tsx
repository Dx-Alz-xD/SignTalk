import type { ReactNode } from 'react'
import { AppWindow } from '@/components/app-window'

/**
 * The outer page frame shared by every route. Kept in one place so the DOM
 * shape stays identical across pages — the Electron build's injected
 * stylesheet targets this structure.
 */
export function PageShell({
  windowTitle,
  children,
}: {
  windowTitle: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center overflow-hidden p-4 md:p-8">
      <AppWindow title={windowTitle}>{children}</AppWindow>
    </main>
  )
}
