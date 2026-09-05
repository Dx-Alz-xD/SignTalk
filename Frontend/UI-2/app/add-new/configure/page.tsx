import { TrainerHeader } from "@/components/trainer/trainer-header"
import { CameraWorkspace } from "@/components/trainer/camera-workspace"

interface ConfigurePageProps {
  searchParams: Promise<{ name?: string; language?: string; phrases?: string }>
}

export default async function ConfigurePage({ searchParams }: ConfigurePageProps) {
  const { name, language, phrases } = await searchParams

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(55%_100%_at_50%_0%,oklch(0.58_0.22_22_/_0.12),transparent_70%)]"
      />

      <TrainerHeader
        crumbs={[
          { label: "SignTalk", href: "/" },
          { label: "Trainer", href: "/" },
          { label: "Add New", href: "/add-new" },
          { label: "Configure" },
        ]}
      />

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 md:px-10">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step 2 of 2</span>
          <h1 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight md:text-4xl">
            {name?.trim() || "Untitled vocabulary"}
          </h1>
          <div className="mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-primary to-ember" />
        </div>

        <CameraWorkspace
          name={name?.trim() || "Untitled vocabulary"}
          language={language?.trim() || ""}
          phrasesIncluded={phrases === "yes"}
        />
      </main>
    </div>
  )
}
