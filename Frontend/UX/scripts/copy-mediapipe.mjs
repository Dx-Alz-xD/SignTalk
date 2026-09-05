/**
 * Copies the MediaPipe WASM runtime out of node_modules and into `public/`.
 *
 * The trainer loads the runtime from our own origin rather than a CDN, so the
 * app works offline and on a locked-down network — the same reason the backend
 * serves hand_landmarker.task itself. These files are ~34 MB of build output,
 * so they are gitignored and regenerated here instead of committed.
 *
 * Runs automatically before `dev` and `build`; safe to run by hand any time.
 */

import { cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const to = join(root, 'public', 'mediapipe', 'wasm')

try {
  await mkdir(to, { recursive: true })
  await cp(from, to, { recursive: true })
  const files = await readdir(to)
  console.log(`mediapipe: ${files.length} runtime files ready in public/mediapipe/wasm`)
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(
      'mediapipe: @mediapipe/tasks-vision is not installed. Run your package ' +
        'manager’s install first — the trainer cannot track hands without it.',
    )
  } else {
    console.error(`mediapipe: could not stage the runtime — ${error.message}`)
  }
  process.exit(1)
}
