import Link from 'next/link'
import { SignTalkLockup } from '@/components/signtalk-mark'
import { HandGraph } from '@/components/hand-graph'

const features = ['Train', 'Translate', 'Direct paste']

/**
 * Stays dark in both themes: the brand surface is the one constant in the
 * product, and a full-bleed saturated panel that flips with the theme reads
 * as two different apps.
 */
export function BrandPanel() {
  return (
    <section className="relative hidden flex-col justify-between overflow-hidden bg-[oklch(0.148_0.024_18)] p-10 text-[oklch(0.97_0.008_30)] md:flex">
      {/* Ambient light, so the panel has depth instead of one flat fill. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-32 size-[26rem] rounded-full bg-[oklch(0.575_0.23_23)] opacity-25 blur-[90px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 size-[24rem] rounded-full bg-[oklch(0.8_0.14_72)] opacity-[0.14] blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]"
        style={{ color: 'oklch(1 0 0 / 8%)' }}
      />

      <div className="relative flex items-center justify-between">
        {/* The panel is always dark, so the lockup takes explicit colours. */}
        <Link
          href="/"
          aria-label="SignTalk home"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <SignTalkLockup
            href="/"
            markClassName="size-7 text-[oklch(0.7_0.21_23)]"
            wordmarkClassName="text-sm text-[oklch(0.97_0.008_30)]"
            accentClassName="text-[oklch(0.7_0.21_23)]"
          />
        </Link>
        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-white/70">
          Preview
        </span>
      </div>

      <div className="relative flex flex-col gap-8">
        {/* Viewfinder: what the recognizer is actually looking at. */}
        <div className="relative mx-auto aspect-[240/268] w-full max-w-[17rem] rounded-2xl border border-white/12 bg-white/[0.03]">
          <Bracket className="left-3 top-3 border-l-2 border-t-2" />
          <Bracket className="right-3 top-3 border-r-2 border-t-2" />
          <Bracket className="bottom-3 left-3 border-b-2 border-l-2" />
          <Bracket className="bottom-3 right-3 border-b-2 border-r-2" />

          <div className="absolute inset-0 p-6 text-[oklch(0.86_0.11_28)]">
            <HandGraph />
          </div>

          <div className="absolute inset-x-4 top-4 flex items-center justify-between font-mono text-[0.625rem] uppercase tracking-[0.14em] text-white/55">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[oklch(0.8_0.14_72)]" aria-hidden="true" />
              Tracking
            </span>
            <span>21 pts</span>
          </div>
        </div>

        <div>
          <p className="text-balance text-[2rem] font-semibold leading-[1.1] tracking-tight">
            Sign language that speaks your signs.
          </p>
          <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-white/65">
            Train, translate, and type with any sign language, live from your camera.
          </p>
        </div>
      </div>

      <div className="relative flex items-center justify-between gap-4">
        <ul className="flex flex-wrap gap-1.5">
          {features.map((feature) => (
            <li
              key={feature}
              className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70"
            >
              {feature}
            </li>
          ))}
        </ul>
        <p className="shrink-0 font-mono text-[0.625rem] tracking-wider text-white/40">v0.1.0</p>
      </div>
    </section>
  )
}

function Bracket({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute size-5 rounded-[3px] border-white/25 ${className}`}
    />
  )
}
