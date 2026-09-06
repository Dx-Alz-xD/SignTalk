import type { ReactNode } from 'react'
import { AppFrame } from '@/components/app-frame'

/**
 * Every /app route renders inside one frame that Next keeps mounted across
 * page changes, so the menu and top bar never re-animate on a click. The
 * frame also gates start-up: see components/app-frame.tsx.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>
}
