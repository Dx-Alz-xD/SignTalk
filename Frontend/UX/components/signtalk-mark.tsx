import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Speech bubble enclosing an OK/F-handshape, three fingers raised, index and
 * thumb closed into a ring.
 */
export function SignTalkMark({
  className,
  /**
   * Thicker strokes and a simplified thumb. Below roughly 28px the fine line
   * work renders thinner than a pixel and turns to mush.
   */
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-primary', className)}
      aria-hidden="true"
    >
      {/* Bubble, with the ring left open at the lower-left for the tail. */}
      <path
        d="M4.12 13.34A8.6 8.6 0 1 1 7.9 17.85L3 21Z"
        strokeWidth={compact ? 1.7 : 1.3}
      />

      {compact ? (
        <g strokeWidth="1.5">
          <path d="M8.7 14.4C8.2 11.9 7.6 9.6 7.3 8.3" />
          <path d="M10.7 13.9C10.3 11.1 9.8 7.9 9.6 6.2" />
          <path d="M12.7 13.6C12.7 10.7 12.7 7 12.8 5.1" />
          <path d="M13.8 12.7C15 10.6 17 10.2 17.7 11.7C18.2 12.9 17.4 14 16.1 13.9" />
          <path d="M8.6 14.7C8.2 17.3 9.7 18.9 11.9 18.7C13.1 18.6 13.6 17.4 13.5 15.6" />
        </g>
      ) : (
        <g strokeWidth="1.05">
          {/* Pinky, ring and middle raised. */}
          <path d="M8.7 14.4C8.1 11.8 7.5 9.4 7.1 8" />
          <path d="M10.7 13.9C10.3 11 9.7 7.6 9.5 5.8" />
          <path d="M12.7 13.6C12.7 10.6 12.7 6.6 12.8 4.6" />
          {/* Index curling over to close the ring. */}
          <path d="M13.8 12.6C15 10.3 17.2 9.9 17.9 11.6C18.4 12.9 17.5 14.1 16.1 14" />
          {/* Palm heel sweeping up into the thumb, meeting the index. */}
          <path d="M8.6 14.6C8.1 17.4 9.6 19 11.9 18.8C13.1 18.7 13.6 17.4 13.5 15.5C14.6 15.1 15.6 14.6 16.1 14" />
        </g>
      )}
    </svg>
  )
}

/** "SIGN TALK" set to match the logo: SIGN in the text colour, TALK in brand red. */
export function SignTalkWordmark({
  className,
  accentClassName,
}: {
  className?: string
  /** Overrides the "TALK" colour on surfaces that don't follow the theme. */
  accentClassName?: string
}) {
  return (
    <span
      className={cn(
        'font-semibold uppercase leading-none tracking-[0.16em] text-foreground',
        className,
      )}
    >
      Sign <span className={cn('text-primary', accentClassName)}>Talk</span>
    </span>
  )
}

/**
 * Mark plus wordmark, the standard horizontal lockup. A link to the workspace
 * by default (a logo that goes home is what people expect); pass `href={null}`
 * for a plain span, e.g. inside another link.
 */
export function SignTalkLockup({
  className,
  markClassName,
  wordmarkClassName,
  accentClassName,
  href = '/app',
}: {
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  accentClassName?: string
  href?: string | null
}) {
  const content = (
    <>
      <SignTalkMark compact className={cn('size-7 shrink-0', markClassName)} />
      <SignTalkWordmark
        className={cn('text-sm', wordmarkClassName)}
        accentClassName={accentClassName}
      />
    </>
  )
  if (href === null) {
    return <span className={cn('flex items-center gap-2.5', className)}>{content}</span>
  }
  return (
    <Link
      href={href}
      aria-label="SignTalk home"
      className={cn(
        'flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-85',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {content}
    </Link>
  )
}
