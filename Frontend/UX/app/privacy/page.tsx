import type { Metadata } from 'next'
import Link from 'next/link'
import { Prose, PublicShell, WithContents } from '@/components/public-shell'
import { PageSchema } from '@/components/structured-data'

const title = 'Privacy Policy'
const description =
  'What SignTalk collects, what it deliberately never collects, where your data goes, who can see it, and how to remove it.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/privacy' },
  openGraph: { title: `${title} · SignTalk`, description, url: '/privacy', type: 'article' },
}

const UPDATED = '6 September 2026'

const sections = [
  { id: 'summary', label: 'In one paragraph' },
  { id: 'never', label: 'What is never collected' },
  { id: 'collected', label: 'What is collected' },
  { id: 'camera', label: 'Camera and hand data' },
  { id: 'pictures', label: 'Reference pictures' },
  { id: 'video', label: 'Video Translator' },
  { id: 'sharing', label: 'What others can see' },
  { id: 'cookies', label: 'Cookies and storage' },
  { id: 'third-parties', label: 'Third parties' },
  { id: 'security', label: 'Security' },
  { id: 'retention', label: 'Retention and deletion' },
  { id: 'children', label: 'Children' },
  { id: 'rights', label: 'Your rights' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
]

export default function PrivacyPage() {
  return (
    <>
      <PageSchema
        name={title}
        description={description}
        path="/privacy"
        crumbs={[
          { name: 'SignTalk', href: '/' },
          { name: 'Privacy', href: '/privacy' },
        ]}
      />
      <PublicShell
        current="/privacy"
        eyebrow="Legal"
        title="Privacy Policy"
        lede="SignTalk was built so that the most sensitive thing it could hold, video of you, is something it never has. This page lists exactly what it does hold."
        updated={UPDATED}
      >
        <WithContents sections={sections}>
          <Prose>
            <h2 id="summary">In one paragraph</h2>
            <p>
              SignTalk keeps an account for you (username, email, optional phone, a password
              hash), the sign languages you train (as hand landmark numbers, not images), and, only
              if you turn it on, one small reference picture per sign. Your camera feed is
              processed in your browser and never uploaded. A video you translate stays in your
              browser; only its soundtrack is sent for transcription and is deleted immediately
              after. Nothing is sold, and nothing is shared with other users unless you publish it.
            </p>

            <h2 id="never">What is never collected</h2>
            <ul>
              <li>
                <strong>Video or photos from your camera.</strong> Hand tracking runs on your
                device. The server receives 21 coordinates per hand and cannot reconstruct an
                image from them.
              </li>
              <li>
                <strong>Your face, body, background or surroundings.</strong> They are not in the
                data that leaves the browser.
              </li>
              <li>
                <strong>Video files.</strong> The Video Translator reads a file you choose in the
                browser and plays it there. The file is not uploaded.
              </li>
              <li>
                <strong>Plaintext passwords or codes.</strong> Passwords are hashed with Argon2id;
                one-time codes and session tokens are stored only as digests.
              </li>
              <li>
                <strong>Advertising identifiers, tracking pixels, or analytics from third
                parties</strong> on a self-hosted installation.
              </li>
            </ul>

            <h2 id="collected">What is collected</h2>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Why</th>
                  <th>Kept</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Username, email, optional phone number</td>
                  <td>To identify your account and send verification codes you ask for</td>
                  <td>While the account exists</td>
                </tr>
                <tr>
                  <td>Password hash (Argon2id)</td>
                  <td>To sign you in</td>
                  <td>While the account exists</td>
                </tr>
                <tr>
                  <td>Session token digest, issue and expiry times, last-seen time</td>
                  <td>To keep you signed in for 30 minutes of inactivity</td>
                  <td>Until expiry or sign-out; purged afterwards</td>
                </tr>
                <tr>
                  <td>Authentication events: sign-ups, sign-ins, failures, code sends, password changes, with IP address</td>
                  <td>To detect abuse and lockouts, and to investigate account problems</td>
                  <td>Log retention set by the operator</td>
                </tr>
                <tr>
                  <td>Your sign languages: names, settings, symbols, what each types</td>
                  <td>So the trainer and translator can work with them</td>
                  <td>Until you delete them</td>
                </tr>
                <tr>
                  <td>Hand landmark samples: 126 numbers per recorded frame</td>
                  <td>To recognise your signs</td>
                  <td>Until you delete the symbol, view or language</td>
                </tr>
                <tr>
                  <td>Reference pictures (opt-in, thumbnail size)</td>
                  <td>To show a sign during sign-to-sign and video translation</td>
                  <td>Until you delete or replace them, or delete the language</td>
                </tr>
                <tr>
                  <td>Audio extracted from a video (16 kHz mono)</td>
                  <td>To transcribe speech with word timings</td>
                  <td>Deleted when transcription finishes; the transcript is returned to your browser and not stored</td>
                </tr>
                <tr>
                  <td>Installs of community languages</td>
                  <td>To show install counts and avoid duplicate copies</td>
                  <td>While the account exists</td>
                </tr>
              </tbody>
            </table>

            <h2 id="camera">Camera and hand data</h2>
            <p>
              When you turn the camera on, your browser asks for permission and shows a live
              preview to you alone. MediaPipe finds the hands in each frame locally. What is sent
              to the server, and only while a capture, recognition or Direct Paste session is
              running, is the list of hand landmarks for that frame: for each hand, a label
              (left or right), a confidence, and 21 points with x, y and depth. During training
              these are stored as your samples. During recognition they are compared and
              discarded.
            </p>
            <p>
              Hand landmark data describes a real person&rsquo;s body and we treat it as personal
              data even where the law may not require it. That is why deletion cascades: removing
              a language removes every sample in it, and removing an account would remove every
              language.
            </p>

            <h2 id="pictures">Reference pictures</h2>
            <p>
              A language has &ldquo;Allow gesture translation&rdquo; off by default. If you turn
              it on, the frame on screen at the end of each capture, or the first image of a
              dataset import, is shrunk to a thumbnail and stored as that symbol&rsquo;s reference
              picture, and a camera button lets you take a new one. This is the only situation in
              which SignTalk stores an image of you. It shows your hands as the preview showed
              them, with the skeleton drawn on top. You can turn the setting off at any time;
              pictures already stored remain until you replace or delete them, and travel with the
              language if you publish it. A symbol with no picture is drawn as a hand skeleton
              from its samples instead, which contains no image of you.
            </p>

            <h2 id="video">Video Translator</h2>
            <p>
              The video you choose is opened by your browser from your own device. To transcribe
              it, the browser decodes the soundtrack, converts it to 16 kHz mono audio and uploads
              only that. The server transcribes it with an on-server speech model, returns the
              words and their timings to your browser, and deletes the audio file. Neither the
              audio nor the transcript is stored. If your browser cannot decode the file, the
              whole file is uploaded instead and deleted the same way. Translation of the
              transcript into another language happens in your browser where it supports it.
            </p>

            <h2 id="sharing">What others can see</h2>
            <ul>
              <li>
                <strong>Nothing, by default.</strong> Your languages, samples and pictures are
                private to your account.
              </li>
              <li>
                <strong>Your public profile</strong> shows your username, the date you joined, and
                the languages you have published. It never shows your email or phone.
              </li>
              <li>
                <strong>A published language</strong> is copied in full to anyone who installs it:
                symbols, outputs, samples and, if gesture translation is on, pictures. Your
                username appears as the author. Think of publishing as sharing your hand geometry
                with strangers, because that is what the samples are.
              </li>
              <li>
                <strong>Unpublishing</strong> stops new installs. Copies already made remain with
                the people who made them.
              </li>
            </ul>

            <h2 id="cookies">Cookies and storage</h2>
            <ul>
              <li>
                <code>signtalk_session</code>: one HttpOnly, SameSite cookie holding your session
                token. Script on the page cannot read it. It expires after 30 minutes of
                inactivity and is cleared on sign-out.
              </li>
              <li>
                <code>signtalk-theme</code> in local storage: light or dark, your choice.
              </li>
              <li>
                <code>signtalk-booted</code> in session storage: whether this tab has shown the
                start-up screen, so it is not shown again on every page.
              </li>
              <li>
                <code>signtalk-notice</code> in session storage, briefly, to carry a message such
                as &ldquo;password updated&rdquo; from one page to the next.
              </li>
            </ul>
            <p>No advertising or cross-site tracking cookies are set.</p>

            <h2 id="third-parties">Third parties</h2>
            <p>The following are contacted only in the situations described:</p>
            <ul>
              <li>
                <strong>Google (MediaPipe model).</strong> The hand-tracking model is served by
                this installation&rsquo;s own API. If that is unreachable, the browser fetches the
                same public model file from Google&rsquo;s storage. No personal data is sent with
                that request.
              </li>
              <li>
                <strong>Hugging Face.</strong> The server downloads the speech model once, on first
                use of the Video Translator. Your audio is not sent there.
              </li>
              <li>
                <strong>Email and SMS providers</strong> (an SMTP server, Twilio or Textbelt), only
                if the operator has configured them, and only to send a verification code you
                requested to the address or number on your account.
              </li>
              <li>
                <strong>A translation server</strong>, only if the operator has configured one and
                your browser has no built-in translator; the text you asked to translate is sent
                to it.
              </li>
              <li>
                <strong>Vercel Analytics</strong>, only on a hosted deployment on Vercel, and not in
                the desktop app or on a self-hosted installation.
              </li>
            </ul>

            <h2 id="security">Security</h2>
            <ul>
              <li>Passwords are hashed with Argon2id; older hashes are upgraded on next sign-in.</li>
              <li>
                Session tokens, one-time codes and recovery tickets are stored as digests, so a
                copy of the database cannot be used to impersonate anyone.
              </li>
              <li>Accounts lock for five minutes after five failed sign-ins.</li>
              <li>
                Every read of a language, sign, symbol or sample is scoped to the signed-in
                owner; a valid session for one account cannot fetch another account&rsquo;s data.
              </li>
              <li>
                Published languages pass an automatic review that refuses keystrokes outside the
                editing set, malformed text, and sample data that is not hand landmarks.
              </li>
            </ul>

            <h2 id="retention">Retention and deletion</h2>
            <ul>
              <li>
                <strong>Languages and everything in them</strong> can be deleted from your Account
                page. Deletion is immediate and cascades to signs, symbols, samples and pictures.
              </li>
              <li>
                <strong>Sessions, codes and tickets</strong> expire on their own and are purged
                after a grace period.
              </li>
              <li>
                <strong>Audio for transcription</strong> is deleted when the job finishes, or when
                it fails.
              </li>
              <li>
                <strong>Your account</strong> can be deleted on request to the operator; deleting
                it removes every language it owns. Authentication events are kept for security
                with the account reference removed.
              </li>
            </ul>

            <h2 id="children">Children</h2>
            <p>
              SignTalk is not directed at children under 13, and we do not knowingly collect their
              data. If a child has created an account, contact the operator and it will be removed.
            </p>

            <h2 id="rights">Your rights</h2>
            <p>
              Depending on where you live you may have rights to access, correct, export or erase
              your personal data, to object to or restrict its processing, and to complain to a
              supervisory authority. The Account page shows the personal data held about you and
              lets you change your password and delete your languages; for anything else, contact
              the operator.
            </p>

            <h2 id="changes">Changes</h2>
            <p>
              We may update this policy. The date at the top says when it last changed. Material
              changes will be made visible in the app.
            </p>

            <h2 id="contact">Contact</h2>
            <p>
              Privacy questions go to the operator of this installation. See also the{' '}
              <Link href="/terms">terms and conditions</Link> and the{' '}
              <Link href="/about">about page</Link>.
            </p>
          </Prose>
        </WithContents>
      </PublicShell>
    </>
  )
}
