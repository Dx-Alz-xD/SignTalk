import { languageTag, type CommunityLanguage } from '@/lib/library'

export type CommunityEntry = {
  id: string
  name: string
  author: string
  /** ISO date (YYYY-MM-DD) so it sorts and range-filters as a plain string. */
  uploadedOn: string
  /** Hand control - left / right / both. Field name kept as the sort key. */
  language: string
  /** True once this account holds a copy. */
  installed: boolean
  /** True when the signed-in account published it. */
  mine: boolean
  signs: number
  samples: number
  /** What kind of sign language, in the author's words. */
  tag: string
  description: string
}

/**
 * A published language as the browse table wants it.
 *
 * The table sorts and range-filters on plain strings, so the timestamp is cut
 * back to a bare ISO date here rather than teaching every comparison about
 * time zones.
 */
export function toEntry(language: CommunityLanguage): CommunityEntry {
  return {
    id: language.id,
    name: language.name,
    author: language.author ?? 'unknown',
    uploadedOn: (language.published_at ?? '').slice(0, 10),
    language: language.hand_control,
    installed: language.installed,
    mine: language.mine,
    signs: language.sign_count,
    samples: language.sample_count,
    tag: languageTag(language),
    description: language.description ?? '',
  }
}



/** Hand-control values present in the loaded rows, for the filter. */
export function availableLanguages(entries: CommunityEntry[]) {
  return [...new Set(entries.map((entry) => entry.language))].sort()
}

/** Spelled out for the filter chips and the column tooltip. */
export const languageNames: Record<string, string> = {
  left: 'Left hand only',
  right: 'Right hand only',
  both: 'Both hands',
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatUploadedOn(iso: string) {
  // Parsed as UTC so the rendered date can't drift a day by timezone.
  const [year, month, day] = iso.split('-').map(Number)
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day)))
}
