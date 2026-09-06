'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, Hand, Images, Loader2, PackageOpen, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormAlert } from '@/components/form-alert'
import { Screen, ScreenBody, ScreenHeader, ScreenLoading } from '@/components/screen'
import { Badge, EmptyState, Panel, Section, StatTile } from '@/components/ui/surface'
import { formatDate } from '@/components/screens/account-screen'
import { errorMessage } from '@/lib/api'
import { fetchProfile, installLanguage, languageTag, type PublicProfile } from '@/lib/library'

/**
 * Another account, as the community sees it: a name, a join date, and the sign
 * languages they have published, each installable from right here.
 */
export function ProfileScreen({ username, onBack }: { username: string; onBack: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const found = await fetchProfile(username, signal)
      if (!signal?.aborted) setProfile(found)
    },
    [username],
  )

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    load(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [load])

  async function install(id: string, name: string) {
    setInstalling(id)
    setFailure(null)
    setNotice(null)
    try {
      await installLanguage(id)
      setNotice(`Installed ${name}. It is in your Trainer and Translator now.`)
      await load()
    } catch (cause) {
      setFailure(errorMessage(cause))
    } finally {
      setInstalling(null)
    }
  }

  const official = username === 'signtalk'
  const letters = username
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Screen>
      <ScreenHeader title={username} subtitle="Public profile" back={{ label: 'Back', onClick: onBack }} />

      <ScreenBody>
        {failure && <FormAlert>{failure}</FormAlert>}
        {notice && <FormAlert tone="success">{notice}</FormAlert>}

        {loading ? (
          <ScreenLoading>Loading profile…</ScreenLoading>
        ) : profile ? (
          <>
            <Panel>
              <div className="flex flex-wrap items-center gap-5">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-xl font-semibold text-primary ring-1 ring-inset ring-primary/20">
                  {letters || 'ST'}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
                    {profile.username}
                    {official && (
                      <Badge tone="primary">
                        <Sparkles className="size-3" aria-hidden="true" />
                        built in
                      </Badge>
                    )}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {official
                      ? 'The sign languages that ship with SignTalk.'
                      : `Joined ${formatDate(profile.joined_at)}`}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <StatTile label="Published" value={profile.published_count} />
                  <StatTile label="Installs" value={profile.install_count} />
                </dl>
              </div>
            </Panel>

            <Section
              eyebrow="Shared with everyone"
              title={`${profile.languages.length} published sign language${
                profile.languages.length === 1 ? '' : 's'
              }`}
              description="Installing takes a full copy: symbols, samples and, where the author kept them, the reference pictures."
            >
              {profile.languages.length === 0 ? (
                <EmptyState
                  icon={<PackageOpen className="size-6" aria-hidden="true" />}
                  title="Nothing published yet"
                  description="When this member shares a sign language it will appear here."
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {profile.languages.map((language) => (
                    <li
                      key={language.id}
                      className="flex flex-col gap-3 rounded-xl border bg-elevated p-4 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium tracking-tight">{language.name}</p>
                          <p className="truncate text-xs text-primary/90">{languageTag(language)}</p>
                          {language.description && (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {language.description}
                            </p>
                          )}
                        </div>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {language.gesture_translation && (
                            <Badge tone="primary">
                              <Images className="size-3" aria-hidden="true" />
                              pictures
                            </Badge>
                          )}
                          <Badge>
                            <Hand className="size-3" aria-hidden="true" />
                            {language.hand_control}
                          </Badge>
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {language.sign_count} vocab · {language.symbol_count} symbols ·{' '}
                        {language.sample_count.toLocaleString()} samples · {language.install_count} install
                        {language.install_count === 1 ? '' : 's'}
                      </p>

                      <div className="mt-auto">
                        {language.mine ? (
                          <Badge>yours</Badge>
                        ) : language.installed ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                            <CheckCircle2 className="size-3.5" aria-hidden="true" />
                            Installed
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => void install(language.id, language.name)}
                            disabled={installing !== null}
                          >
                            {installing === language.id ? (
                              <Loader2 className="animate-spin" aria-hidden="true" />
                            ) : (
                              <Download aria-hidden="true" />
                            )}
                            Install
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        ) : (
          <EmptyState
            icon={<PackageOpen className="size-6" aria-hidden="true" />}
            title="No such member"
            description="That profile does not exist, or the account has been removed."
            actions={
              <Button size="sm" onClick={onBack}>
                Go back
              </Button>
            }
          />
        )}
      </ScreenBody>
    </Screen>
  )
}
