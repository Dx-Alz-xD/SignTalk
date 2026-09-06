import type { Metadata } from 'next'
import Link from 'next/link'
import { Prose, PublicShell, WithContents } from '@/components/public-shell'
import { PageSchema } from '@/components/structured-data'

const title = 'Terms and Conditions'
const description =
  'The terms under which SignTalk is provided: your account, what you may do with it, what you publish to the community database, and the limits of what we promise.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/terms' },
  openGraph: { title: `${title} · SignTalk`, description, url: '/terms', type: 'article' },
}

const UPDATED = '6 September 2026'

const sections = [
  { id: 'agreement', label: 'The agreement' },
  { id: 'account', label: 'Your account' },
  { id: 'use', label: 'Acceptable use' },
  { id: 'content', label: 'Your content' },
  { id: 'community', label: 'Publishing to the community' },
  { id: 'installed', label: 'Installed languages' },
  { id: 'direct-paste', label: 'Direct Paste and the desktop app' },
  { id: 'service', label: 'The service itself' },
  { id: 'warranty', label: 'No warranty' },
  { id: 'liability', label: 'Limitation of liability' },
  { id: 'termination', label: 'Ending things' },
  { id: 'changes', label: 'Changes to these terms' },
  { id: 'contact', label: 'Contact' },
]

export default function TermsPage() {
  return (
    <>
      <PageSchema
        name={title}
        description={description}
        path="/terms"
        crumbs={[
          { name: 'SignTalk', href: '/' },
          { name: 'Terms', href: '/terms' },
        ]}
      />
      <PublicShell
        current="/terms"
        eyebrow="Legal"
        title="Terms and Conditions"
        lede="Plain terms for a tool that learns from your hands. Read them once; they are short on purpose."
        updated={UPDATED}
      >
        <WithContents sections={sections}>
          <Prose>
            <h2 id="agreement">1. The agreement</h2>
            <p>
              These terms are an agreement between you and the people who operate this SignTalk
              installation (&ldquo;we&rdquo;, &ldquo;the operator&rdquo;). By creating an account,
              signing in, or using any part of the service, you accept them. If you do not accept
              them, do not use the service.
            </p>
            <p>
              SignTalk is software that can be run by anyone. These terms cover the instance you
              are using at this address. If you run your own copy, you are the operator of that
              copy and these terms do not bind you to us.
            </p>

            <h2 id="account">2. Your account</h2>
            <ul>
              <li>
                You need an account to use the workspace. You must give a working email address
                and choose a username; a phone number is optional and used only for verification
                codes you request.
              </li>
              <li>
                You are responsible for keeping your password to yourself and for everything done
                with your account. Change your password from the Account page if you think it has
                leaked; that signs every other device out.
              </li>
              <li>
                One person, one account. Do not share an account or create accounts to get around
                a restriction placed on another one.
              </li>
              <li>
                Your username is shown publicly on anything you publish and on your profile page.
                Your email and phone number are never shown to other users.
              </li>
            </ul>

            <h2 id="use">3. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the service to harass, threaten, impersonate or defame anyone.</li>
              <li>
                Record or upload sign samples, pictures, datasets or videos of another person
                without their permission.
              </li>
              <li>
                Publish a sign language whose symbol names, phrases or outputs are abusive,
                deceptive, or designed to do harm when typed into someone else&rsquo;s
                application.
              </li>
              <li>
                Probe, scrape, overload or interfere with the service, its API, or other
                users&rsquo; data, or try to access an account that is not yours.
              </li>
              <li>
                Upload content you have no right to: a video you may not redistribute, a dataset
                whose licence forbids it, someone else&rsquo;s trained language passed off as
                your own.
              </li>
              <li>Use the service to break any law that applies to you.</li>
            </ul>

            <h2 id="content">4. Your content</h2>
            <p>
              Everything you record, import, type or upload stays yours: your sign languages,
              their samples, the pictures you choose to keep, your transcripts. You give us only
              the licence we need to run the service for you: to store your data, process it, and
              show it back to you.
            </p>
            <p>
              You are responsible for your content. Make sure you have the right to use any
              dataset or video you bring in, and that anyone whose hands appear in your samples
              or pictures has agreed to it.
            </p>
            <p>
              You can delete a language, and everything inside it, from your Account page at any
              time. Deletion is immediate and permanent for the copy in your library.
            </p>

            <h2 id="community">5. Publishing to the community</h2>
            <p>
              When you publish a language to the community database, you are choosing to let any
              signed-in user install a full copy of it: its symbols, their outputs, every recorded
              sample, and, if you have turned on gesture translation, the reference pictures.
              Your username is shown as the author.
            </p>
            <ul>
              <li>
                By publishing you grant every user who installs the language a perpetual,
                royalty-free licence to use their copy for their own signing, training and
                translation. You keep every other right.
              </li>
              <li>
                Publishing is subject to an automatic security review. Languages whose symbols
                press keys outside the editing set, send shortcuts outside clipboard and undo, or
                contain malformed text or data are refused until fixed. Passing the review is not
                an endorsement of the content.
              </li>
              <li>
                You may unpublish at any time. Copies already installed by other users remain
                with them; unpublishing prevents new installs.
              </li>
              <li>
                We may remove a published language that breaks these terms or that we receive a
                credible complaint about, and may suspend the account that published it.
              </li>
            </ul>

            <h2 id="installed">6. Installed languages</h2>
            <p>
              A language you install from the community is a copy in your library. It was made by
              another user, not by us. We do not check that it is accurate, complete or fit for
              any purpose, and we are not responsible for what it recognises or types. If a
              language misbehaves, delete it from your Account page.
            </p>

            <h2 id="direct-paste">7. Direct Paste and the desktop app</h2>
            <p>
              Direct Paste types recognised signs into the text field you have focused. In the
              desktop app it can type into any application on your computer. You are in control
              of what is focused and when the camera is on; anything typed as a result is your
              action. Check a newly installed language in the scratchpad before letting it type
              into something that matters.
            </p>

            <h2 id="service">8. The service itself</h2>
            <ul>
              <li>
                We may change, add to or remove features, and may take the service down for
                maintenance or for good. Where reasonably possible we will say so first.
              </li>
              <li>
                Optional capabilities depend on your device and browser: on-device translation,
                camera access, fullscreen, audio decoding. Their absence is not a fault in the
                service.
              </li>
              <li>
                Speech transcription and dataset import run on the operator&rsquo;s server and
                may be unavailable if the operator has not installed the components they need.
              </li>
            </ul>

            <h2 id="warranty">9. No warranty</h2>
            <p>
              SignTalk is provided as is and as available. Recognition is probabilistic: it will
              sometimes be wrong, and it will be wrong more often with less training, poor light,
              or a hand at an angle it has not seen. Do not rely on it where a misread sign could
              cause harm, and never as a substitute for a qualified human interpreter in medical,
              legal or emergency settings. We make no promise that the service will be
              uninterrupted, error-free, or secure against every attack.
            </p>

            <h2 id="liability">10. Limitation of liability</h2>
            <p>
              To the fullest extent the law allows, we are not liable for any indirect,
              incidental, special or consequential loss, for lost data, or for anything typed,
              translated or transcribed incorrectly. Where liability cannot be excluded, it is
              limited to the amount you paid us for the service in the previous twelve months,
              which for a free service is nothing. Nothing in these terms limits liability that
              cannot lawfully be limited.
            </p>

            <h2 id="termination">11. Ending things</h2>
            <p>
              You can stop using the service at any time; deleting your languages removes your
              content from it. We may suspend or close an account that breaks these terms, with
              notice where practical and without notice where the breach is serious or ongoing.
              Sections 4 through 10 survive the end of the agreement.
            </p>

            <h2 id="changes">12. Changes to these terms</h2>
            <p>
              We may update these terms. The date at the top says when they last changed. If a
              change materially affects you we will make it visible in the app. Continuing to use
              the service after a change means you accept the updated terms.
            </p>

            <h2 id="contact">13. Contact</h2>
            <p>
              Questions about these terms go to the operator of this installation. The{' '}
              <Link href="/privacy">privacy policy</Link> explains what data the service handles
              and how; the <Link href="/about">about page</Link> explains what it does.
            </p>
          </Prose>
        </WithContents>
      </PublicShell>
    </>
  )
}
