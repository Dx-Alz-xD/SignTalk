import Image from 'next/image'
import { cn } from '@/lib/utils'

/** The SignTalk mark — the speech bubble enclosing an OK handshape. */
export function SignTalkMark({ className }: { className?: string }) {
  return (
    <Image
      src="/signtalk-mark.png"
      alt=""
      width={256}
      height={256}
      preload
      aria-hidden="true"
      className={cn('size-7 shrink-0 object-contain', className)}
    />
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
      className={cn('font-semibold uppercase leading-none tracking-[0.16em] text-foreground', className)}
    >
      Sign <span className={cn('text-primary', accentClassName)}>Talk</span>
    </span>
  )
}

/** Mark plus wordmark, the standard horizontal lockup. */
export function SignTalkLockup({
  className,
  markClassName,
  wordmarkClassName,
  accentClassName,
}: {
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  accentClassName?: string
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <SignTalkMark className={cn('size-7', markClassName)} />
      <SignTalkWordmark className={cn('text-sm', wordmarkClassName)} accentClassName={accentClassName} />
    </span>
  )
}
