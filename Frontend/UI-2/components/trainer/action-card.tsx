import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"

export type CardAccent = "crimson" | "jade" | "iris"
/* featured = the primary path (filled CTA), standard = a normal card, ghost = a quieter, dashed one. */
export type CardVariant = "featured" | "standard" | "ghost"

interface ActionCardProps {
  icon: LucideIcon
  title: string
  description: string
  meta: string
  cta: string
  accent: CardAccent
  variant: CardVariant
  href?: string
}

/* Tailwind needs whole class names at build time, so each accent is spelled out. */
const accents: Record<CardAccent, { solid: string; tint: string; glow: string; hover: string; arrow: string }> = {
  crimson: {
    solid: "bg-primary text-primary-foreground",
    tint: "bg-primary/10 text-primary ring-primary/20",
    glow: "bg-primary/25",
    hover:
      "hover:border-primary/50 hover:shadow-[0_18px_40px_-20px_oklch(0.5_0.2_22_/_0.7)] focus-visible:ring-primary",
    arrow: "group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground",
  },
  jade: {
    solid: "bg-jade text-jade-foreground",
    tint: "bg-jade/10 text-jade ring-jade/20",
    glow: "bg-jade/25",
    hover: "hover:border-jade/50 hover:shadow-[0_18px_40px_-20px_oklch(0.55_0.12_165_/_0.7)] focus-visible:ring-jade",
    arrow: "group-hover:border-jade group-hover:bg-jade group-hover:text-jade-foreground",
  },
  iris: {
    solid: "bg-iris text-iris-foreground",
    tint: "bg-iris/10 text-iris ring-iris/20",
    glow: "bg-iris/25",
    hover: "hover:border-iris/50 hover:shadow-[0_18px_40px_-20px_oklch(0.53_0.19_292_/_0.7)] focus-visible:ring-iris",
    arrow: "group-hover:border-iris group-hover:bg-iris group-hover:text-iris-foreground",
  },
}

const shells: Record<CardVariant, string> = {
  featured: "border-primary/35 bg-card shadow-[0_12px_32px_-26px_oklch(0.5_0.2_22_/_0.9)]",
  standard: "border-border bg-card",
  ghost: "border-dashed border-border bg-muted/40",
}

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <h2 className="font-display text-xl font-semibold tracking-tight text-card-foreground">{title}</h2>
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function CardBody({ icon: Icon, title, description, meta, cta, accent, variant }: Omit<ActionCardProps, "href">) {
  const a = accents[accent]

  const glow = (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -right-12 -top-12 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100 ${a.glow}`}
    />
  )

  if (variant === "featured") {
    return (
      <>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,oklch(0.52_0.22_22_/_0.09),transparent_58%)]"
        />
        {glow}

        <div className="relative flex w-full items-start justify-between gap-4">
          <span className={`flex size-14 items-center justify-center rounded-2xl shadow-sm ${a.solid}`}>
            <Icon className="size-6" />
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm ${a.solid}`}
          >
            {meta}
          </span>
        </div>

        <div className="relative flex flex-1 flex-col">
          <Heading title={title} description={description} />
        </div>

        <span
          className={`relative flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-opacity group-hover:opacity-90 ${a.solid}`}
        >
          {cta}
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </>
    )
  }

  if (variant === "ghost") {
    return (
      <>
        {glow}

        <div className="relative flex w-full items-center gap-3">
          <span className={`flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ${a.tint}`}>
            <Icon className="size-5" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{meta}</span>
        </div>

        <div className="relative flex flex-1 flex-col">
          <Heading title={title} description={description} />
        </div>

        <span className="relative flex w-full items-center gap-1.5 border-t border-dashed border-border pt-4 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          {cta}
          <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </>
    )
  }

  return (
    <>
      {glow}

      <div className="relative flex w-full items-start justify-between gap-4">
        <span
          className={`flex size-14 items-center justify-center rounded-full ring-1 ring-inset transition-colors duration-300 ${a.tint}`}
        >
          <Icon className="size-6" />
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${a.tint}`}
        >
          {meta}
        </span>
      </div>

      <div className="relative flex flex-1 flex-col">
        <Heading title={title} description={description} />
      </div>

      <div className="relative flex w-full items-center justify-between border-t border-border pt-4">
        <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          {cta}
        </span>
        <span
          className={`flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 ${a.arrow}`}
        >
          <ArrowUpRight className="size-4.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </div>
    </>
  )
}

export function ActionCard({ icon, title, description, meta, cta, accent, variant, href }: ActionCardProps) {
  const cardClass = `group relative flex h-full flex-col items-start gap-5 overflow-hidden rounded-2xl border p-6 text-left transition-all duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${shells[variant]} ${accents[accent].hover}`

  const body = (
    <CardBody
      icon={icon}
      title={title}
      description={description}
      meta={meta}
      cta={cta}
      accent={accent}
      variant={variant}
    />
  )

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    )
  }

  return (
    <button type="button" className={cardClass}>
      {body}
    </button>
  )
}
