import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Clapperboard,
  Database,
  Eye,
  GraduationCap,
  Hand,
  Keyboard,
  Languages,
  Lock,
  ShieldCheck,
} from 'lucide-react'
import { Feature, Prose, PublicShell, WithContents } from '@/components/public-shell'
import { PageSchema } from '@/components/structured-data'

const title = 'About SignTalk'
const description =
  'What SignTalk is, how it interprets and teaches any sign language from a camera, and the design choices behind it: landmarks not video, models you own, and nothing shared without asking.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/about' },
  openGraph: { title: `${title} · SignTalk`, description, url: '/about', type: 'article' },
}

const sections = [
  { id: 'what', label: 'What it is' },
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'What you can do' },
  { id: 'languages', label: 'Any sign language' },
  { id: 'privacy', label: 'Privacy by design' },
  { id: 'community', label: 'The community shelf' },
  { id: 'stack', label: 'Under the hood' },
  { id: 'limits', label: 'Honest limits' },
]

export default function AboutPage() {
  return (
    <>
      <PageSchema
        name={title}
        description={description}
        path="/about"
        crumbs={[
          { name: 'SignTalk', href: '/' },
          { name: 'About', href: '/about' },
        ]}
      />
      <PublicShell
        current="/about"
        eyebrow="About"
        title="Sign language that speaks your signs."
        lede="SignTalk turns a webcam into an interpreter, a tutor and a keyboard for sign language: any standard one, or one you make up yourself. It reads the shape of your hands, never your face or your room, and everything it learns belongs to you."
      >
        <WithContents sections={sections}>
          <Prose>
            <h2 id="what">What it is</h2>
            <p>
              Most sign language software supports one language, recognises a fixed set of signs,
              and asks you to trust it with your video. SignTalk starts from the opposite end.
              It ships with two alphabets (Indian Sign Language and American Sign Language), but
              the point of it is that <strong>you teach it</strong>: hold a sign in front of the
              camera for a few seconds and it becomes part of your vocabulary, ready to be
              recognised, typed, translated and shared.
            </p>
            <p>
              The same engine then does four jobs. It interprets what you sign into text and
              on into any spoken language. It types what you sign into whatever text field you
              are working in. It plays a spoken video with the words signed over the top. And it
              translates between sign languages, showing one language&rsquo;s signs for text that
              came from another.
            </p>

            <h2 id="how">How it works</h2>
            <p>
              Your camera feed never leaves your device. In the browser, MediaPipe&rsquo;s hand
              tracker finds 21 points on each hand in every frame. Those 21 points, and only those,
              are what SignTalk works with.
            </p>
            <ol>
              <li>
                <strong>Landmarks.</strong> Each hand becomes 21 (x, y, z) positions. A frame
                with two hands is 126 numbers. No pixels are kept.
              </li>
              <li>
                <strong>Features.</strong> The landmarks are normalised so that where your hand
                is, how big it is and how much your wrist is tilted stop mattering: centred on
                the wrist, scaled by the palm, rotated so the palm axis is fixed. The removed
                rotation is kept as its own pair of numbers so that signs which differ only by
                orientation stay apart. Twenty-eight distances between fingertips and knuckles
                are added because fingertip separation is what tells most handshapes apart. The
                result is a 190-number vector per frame.
              </li>
              <li>
                <strong>Training.</strong> When you record a sign, SignTalk collects about forty
                frames while your hand is holding still; frames where you are still moving into
                the pose are skipped. You can record the same sign from several angles, which
                measurably improves recognition when your hand is not square to the camera.
              </li>
              <li>
                <strong>Recognition.</strong> A new frame is compared against every stored sample
                with a weighted nearest-neighbour vote. Confidence is based on the margin
                between the best label and its closest competitor, not on raw closeness, because
                every hand is somewhat close to something. A sign is only reported once it has
                held steady across several frames.
              </li>
            </ol>
            <p>
              The numbers were tuned on a held-out split of the bundled ASL dataset rather than
              guessed: the neighbour count, the distance cut-off, the confidence threshold and
              the stillness threshold each have a measured reason for their value.
            </p>

            <h2 id="features">What you can do</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Feature icon={<Languages className="size-5" aria-hidden="true" />} title="Translator">
                Live signs to text, across every sign language in your library at once or one at a
                time. Carry the text into a spoken language, or into another sign language shown
                sign by sign. A speed mode follows fluent signing.
              </Feature>
              <Feature icon={<GraduationCap className="size-5" aria-hidden="true" />} title="Trainer">
                Create a sign language, add symbols, hold each one for the camera. Set which hands
                it uses, how many frames a capture takes, what each symbol types. Import a whole
                dataset from a folder or zip.
              </Feature>
              <Feature icon={<Keyboard className="size-5" aria-hidden="true" />} title="Direct Paste">
                Keep the camera on, click into any text field, sign. The words are typed at your
                cursor. In the desktop app that means any application on your computer.
              </Feature>
              <Feature icon={<Clapperboard className="size-5" aria-hidden="true" />} title="Video Translator">
                Open a spoken video. Its speech is transcribed with word-level timing and each word
                is signed over the video exactly while it is said, in the sign language you choose.
              </Feature>
              <Feature icon={<Database className="size-5" aria-hidden="true" />} title="Community">
                Publish a sign language for others to install, samples included, so it recognises
                signs the moment it lands. Browse what other people have shared and see who made it.
              </Feature>
              <Feature icon={<Hand className="size-5" aria-hidden="true" />} title="Sign to sign">
                Give a language a reference picture per symbol and it can be a translation target:
                text is spelled out as its signs, at a pace you set. Symbols without a photo are
                drawn as a hand skeleton from their own samples.
              </Feature>
            </div>

            <h2 id="languages">Any sign language</h2>
            <p>
              SignTalk has no built-in idea of what a sign means. A <strong>language</strong> is a
              name, the spoken language its symbols spell, which hands it uses and a few recording
              settings. Inside it are <strong>vocabularies</strong> (an alphabet, a set of
              greetings), and inside those are <strong>symbols</strong>, each of which types
              something: a letter, a word, a phrase, a space, or an editing key.
            </p>
            <p>
              That structure is why a regional dialect, a classroom&rsquo;s agreed signs or a
              private shorthand between two people are all first-class citizens here, and why
              the Translator can be told to listen to everything you know at once and still tell
              you which vocabulary each sign came from.
            </p>
            <p>
              Two languages come pre-installed for every account so that there is something to
              interpret on day one: the ISL alphabet, learned from a dataset of about twelve
              thousand images, and the ASL alphabet and digits, learned from roughly two and a
              half thousand photographed from several angles. Both were imported through the same
              pipeline your own recordings use.
            </p>

            <h2 id="privacy">Privacy by design</h2>
            <p>
              The decision to work from landmarks rather than video is the whole privacy story,
              and it was made first. What follows from it:
            </p>
            <ul>
              <li>
                <strong>No frames are uploaded or stored.</strong> The server receives 21 points
                per hand and nothing else. It cannot reconstruct your face, your room or your
                clothes, because it never had them.
              </li>
              <li>
                <strong>Pictures are opt-in and small.</strong> Sign-to-sign translation needs a
                picture per symbol. Only a language whose owner has turned on gesture translation
                keeps one, taken from the preview at the end of a capture, shrunk to a thumbnail.
                It is the only place SignTalk ever stores an image of you.
              </li>
              <li>
                <strong>Video stays in the browser.</strong> The Video Translator sends only the
                soundtrack, as a small audio file, for transcription. It is deleted the moment the
                words are out.
              </li>
              <li>
                <strong>Passwords and sessions are hashed.</strong> Argon2id for passwords; the
                session token and every one-time code are stored only as a digest.
              </li>
            </ul>
            <p>
              The <Link href="/privacy">privacy policy</Link> spells this out item by item.
            </p>

            <h2 id="community">The community shelf</h2>
            <p>
              Publishing a language copies its symbols, samples and (if enabled) pictures to
              anyone who installs it. Because an installed language can also{' '}
              <em>type</em> into other people&rsquo;s applications through Direct Paste, every
              publish first passes a security review: symbols may only press editing and
              navigation keys or clipboard and undo shortcuts, text is checked for control
              characters and markup, and sample data is checked to be real hand landmarks.
              Anything that fails is named, and the language stays private until it is fixed.
            </p>
            <p>
              You can take a language down at any time from your account page. Copies people have
              already installed are theirs; they are not reached into.
            </p>

            <h2 id="stack">Under the hood</h2>
            <table>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>What it is</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Web app</td>
                  <td>Next.js and React, with MediaPipe Tasks running the hand tracker in the browser.</td>
                </tr>
                <tr>
                  <td>API</td>
                  <td>FastAPI. Accounts, the sign library, training, recognition, publishing, transcription jobs.</td>
                </tr>
                <tr>
                  <td>Recognition</td>
                  <td>A shared Python feature encoder and nearest-neighbour classifier, identical for the web app and the desktop detector.</td>
                </tr>
                <tr>
                  <td>Database</td>
                  <td>PostgreSQL where one is available; otherwise SQLite, created automatically, so a single machine runs everything.</td>
                </tr>
                <tr>
                  <td>Speech</td>
                  <td>faster-whisper on the server for word-timed transcripts; the browser&rsquo;s own translator for text between languages.</td>
                </tr>
                <tr>
                  <td>Desktop</td>
                  <td>An Electron shell around the same web app, adding system-wide typing for Direct Paste.</td>
                </tr>
              </tbody>
            </table>

            <h2 id="limits">Honest limits</h2>
            <ul>
              <li>
                SignTalk recognises <strong>handshapes held still</strong>. Signs that are all
                movement, or that depend on facial expression, are not something it can see yet.
              </li>
              <li>
                Recognition quality follows training quality. Twenty samples from one angle will
                work at that angle; a few dozen from three angles will work across the room.
              </li>
              <li>
                Spoken-language translation runs in your browser when it can (Chrome 138 and
                later) or through a translation server you configure. Without either, text is
                passed through unchanged and the app says so.
              </li>
              <li>
                Word timing in the Video Translator is as good as the transcription. Fast
                speech makes for fast signs; the speed control exists for that reason.
              </li>
            </ul>
            <p className="flex flex-wrap items-center gap-3 pt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                <Eye className="size-3.5" aria-hidden="true" /> Landmarks, never video
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden="true" /> Your models, your account
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" aria-hidden="true" /> Reviewed before sharing
              </span>
            </p>
          </Prose>
        </WithContents>
      </PublicShell>
    </>
  )
}
