import { TrainerHeader } from "@/components/trainer/trainer-header"
import { AddNewForm } from "@/components/trainer/add-new-form"

export default function AddNewPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(60%_100%_at_50%_0%,oklch(0.58_0.22_22_/_0.14),transparent_70%)]"
      />
      <div aria-hidden="true" className="bg-blueprint pointer-events-none absolute inset-x-0 top-0 h-[460px]" />

      <TrainerHeader
        crumbs={[{ label: "SignTalk", href: "/" }, { label: "Trainer", href: "/" }, { label: "Add New" }]}
      />

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16 md:px-10">
        <div className="mb-10 max-w-xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step 1 of 2</span>
          <h1 className="mt-3 text-balance font-display text-4xl font-bold tracking-tight md:text-5xl">Add New</h1>
          <div className="mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-primary to-ember" />
          <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground">
            Give the vocabulary a name and a language. Next you will open the camera and start recording each sign.
          </p>
        </div>

        <AddNewForm />
      </main>
    </div>
  )
}
