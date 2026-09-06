import { AppWindow } from '@/components/trainer/app-window'
import { TrainerHeader } from '@/components/trainer/trainer-header'
import { VocabularyTable } from '@/components/trainer/vocabulary-table'

export default function SelectExistingPage() {
  return (
    <main className="flex min-h-svh items-center justify-center overflow-hidden p-4 md:p-8">
      <AppWindow title="SignTalk — Vocabularies">
        <div className="flex flex-1 flex-col animate-screen-in">
          <TrainerHeader
            crumbs={[
              { label: 'SignTalk', href: '/' },
              { label: 'Trainer', href: '/' },
              { label: 'Select Existing' },
            ]}
          />

          <div className="flex flex-1 flex-col gap-6 px-5 py-9 sm:px-8">
            <VocabularyTable />
          </div>
        </div>
      </AppWindow>
    </main>
  )
}
