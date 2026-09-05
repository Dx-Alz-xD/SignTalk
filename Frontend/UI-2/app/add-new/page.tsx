import { AppWindow } from '@/components/trainer/app-window'
import { TrainerHeader } from '@/components/trainer/trainer-header'
import { AddNewForm } from '@/components/trainer/add-new-form'

export default function AddNewPage() {
  return (
    <main className="flex min-h-svh items-center justify-center overflow-hidden p-4 md:p-8">
      <AppWindow title="SignTalk — New vocabulary">
        <div className="flex flex-1 flex-col animate-screen-in">
          <TrainerHeader
            crumbs={[{ label: 'SignTalk', href: '/' }, { label: 'Trainer', href: '/' }, { label: 'Add New' }]}
          />

          <div className="flex flex-1 flex-col justify-center gap-7 px-5 py-9 sm:px-8">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">Add a new vocabulary</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Name it and pick its language. You can record the signs on the next screen.
              </p>
            </div>

            <AddNewForm />
          </div>
        </div>
      </AppWindow>
    </main>
  )
}
