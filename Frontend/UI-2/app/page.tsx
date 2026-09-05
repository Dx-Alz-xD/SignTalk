import { Globe, Library, Plus } from "lucide-react"
import { TrainerHeader } from "@/components/trainer/trainer-header"
import { ActionCard, type CardAccent, type CardVariant } from "@/components/trainer/action-card"

const actions: {
  icon: typeof Library
  title: string
  description: string
  meta: string
  cta: string
  accent: CardAccent
  variant: CardVariant
  href?: string
}[] = [
  {
    icon: Library,
    title: "Select Existing",
    description: "Reopen a vocabulary you have already trained to add signs, re-record weak samples, or retrain it.",
    meta: "Library",
    cta: "Open library",
    accent: "jade",
    variant: "standard",
  },
  {
    icon: Plus,
    title: "Add New",
    description: "Start from scratch — name the vocabulary, choose its language, then record your first signs.",
    meta: "Start here",
    cta: "Start recording",
    accent: "crimson",
    variant: "featured",
    href: "/add-new",
  },
  {
    icon: Globe,
    title: "See Online",
    description: "Browse vocabularies published by the community and pull one into your local studio.",
    meta: "Community",
    cta: "Browse community",
    accent: "iris",
    variant: "ghost",
  },
]

export default function TrainerPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_100%_at_50%_0%,oklch(0.58_0.22_22_/_0.16),transparent_70%)]"
      />
      <div aria-hidden="true" className="bg-blueprint pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <div
        aria-hidden="true"
        className="animate-float-slow pointer-events-none absolute -right-24 top-24 size-72 rounded-full bg-iris/10 blur-3xl"
      />

      <TrainerHeader crumbs={[{ label: "SignTalk", href: "/" }, { label: "Trainer" }]} />

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16 md:px-10">
        <div className="mb-12 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            Sign language model studio
          </span>

          <h1 className="mt-5 text-balance font-display text-4xl font-bold tracking-tight md:text-5xl">Trainer</h1>
          <div className="mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-primary to-ember" />

          <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            Teach SignTalk a new gesture vocabulary. Record samples from your camera, train a recognition model, and put
            it to work — all from this workspace.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((action) => (
            <ActionCard key={action.title} {...action} />
          ))}
        </div>
      </main>
    </div>
  )
}
