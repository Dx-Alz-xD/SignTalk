import { AppWindow } from '@/components/app-window'
import { CommunityDatabaseScreen } from '@/components/community-database'

export default function Page() {
  return (
    <main className="flex min-h-svh items-center justify-center overflow-hidden p-4 md:p-8">
      <AppWindow title="SignTalk — Community Database">
        <CommunityDatabaseScreen />
      </AppWindow>
    </main>
  )
}
