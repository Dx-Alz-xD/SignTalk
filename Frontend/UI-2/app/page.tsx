import { Globe, Library, Plus } from 'lucide-react'
import { AppWindow } from '@/components/trainer/app-window'
import { TrainerHeader } from '@/components/trainer/trainer-header'
import { ActionCard, FeaturedCard, type Action } from '@/components/trainer/action-card'

const featured: Action = {
  title: 'Add New',
  description:
    'Start from scratch — name the vocabulary, choose its language, then record your first signs from the camera.',
  icon: Plus,
  meta: 'Start here',
  href: '/add-new',
}

const actions: Action[] = [
  {
    title: 'Select Existing',
    description: 'Reopen a vocabulary you have already trained to add signs, re-record weak samples, or retrain it.',
    icon: Library,
    meta: 'Library',
    href: '/select-existing',
  },
  {
    title: 'See Online',
    description: 'Browse vocabularies published by the community and pull one into your local studio.',
    icon: Globe,
    meta: 'Not connected',
    pending: true,
  },
]

export default function TrainerPage() {
  return (
    <main className="flex min-h-svh items-center justify-center overflow-hidden p-4 md:p-8">
      <AppWindow title="SignTalk — Trainer">
        <div className="flex flex-1 flex-col animate-screen-in">
          <TrainerHeader crumbs={[{ label: 'SignTalk', href: '/' }, { label: 'Trainer' }]} />

          <div className="flex flex-1 flex-col justify-center gap-7 px-5 py-9 sm:px-8">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">What would you like to train?</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Teach SignTalk a new gesture vocabulary, or pick up one you started.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <FeaturedCard action={featured} />
              <div className="grid gap-4 sm:grid-cols-2">
                {actions.map((action) => (
                  <ActionCard key={action.title} action={action} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </AppWindow>
    </main>
  )
}
