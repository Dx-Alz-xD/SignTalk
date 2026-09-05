import { AppWindow } from '@/components/trainer/app-window'
import { CameraWorkspace } from '@/components/trainer/camera-workspace'

export default function ConfigurePage() {
  return (
    <main className="flex min-h-svh items-center justify-center overflow-hidden p-4 md:p-8">
      <AppWindow title="SignTalk — Record signs">
        <CameraWorkspace />
      </AppWindow>
    </main>
  )
}
