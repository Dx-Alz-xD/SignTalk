import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Crumb } from '@/components/structured-data'
import { cn } from '@/lib/utils'

/**
 * Visible breadcrumb trail. The matching BreadcrumbList JSON-LD is emitted by
 * PageSchema, Google requires the markup to describe a trail the user can
 * actually see, so the two are always passed the same array.
 *
 * The last crumb is the current page: rendered as plain text with
 * aria-current, not a link to itself.
 */
export function Breadcrumbs({
  crumbs,
  className,
}: {
  crumbs: Crumb[]
  className?: string
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('-mt-1', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
              )}
              {isLast ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
