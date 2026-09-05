export type CommunityEntry = {
  id: string
  name: string
  author: string
  /** ISO date (YYYY-MM-DD) so it sorts and range-filters as a plain string. */
  uploadedOn: string
  language: string
}

/** Two-letter codes shown in the Language column, with names used for search. */
export const languageNames: Record<string, string> = {
  EN: 'English',
  JP: 'Japanese',
  ES: 'Spanish',
  FR: 'French',
  DE: 'German',
  IT: 'Italian',
  KR: 'Korean',
  CN: 'Chinese',
  PT: 'Portuguese',
  NL: 'Dutch',
  AR: 'Arabic',
  RU: 'Russian',
}

export const communityEntries: CommunityEntry[] = [
  { id: 'c01', name: 'Alphabet A–Z', author: 'maya.chen', uploadedOn: '2026-08-14', language: 'EN' },
  { id: 'c02', name: 'Numbers 0–100', author: 'r.okafor', uploadedOn: '2026-08-02', language: 'EN' },
  { id: 'c03', name: 'Everyday Greetings', author: 'yuki.tanaka', uploadedOn: '2026-07-28', language: 'JP' },
  { id: 'c04', name: 'Medical Vocabulary', author: 'dr.alvarez', uploadedOn: '2026-07-19', language: 'ES' },
  { id: 'c05', name: 'Kitchen & Cooking', author: 'l.dubois', uploadedOn: '2026-07-11', language: 'FR' },
  { id: 'c06', name: 'Travel Essentials', author: 'm.schmidt', uploadedOn: '2026-06-30', language: 'DE' },
  { id: 'c07', name: 'Classroom Basics', author: 's.rossi', uploadedOn: '2026-06-22', language: 'IT' },
  { id: 'c08', name: 'Emotions & Feelings', author: 'h.park', uploadedOn: '2026-06-15', language: 'KR' },
  { id: 'c09', name: 'Family Members', author: 'w.zhang', uploadedOn: '2026-06-03', language: 'CN' },
  { id: 'c10', name: 'Workplace Terms', author: 'a.costa', uploadedOn: '2026-05-27', language: 'PT' },
  { id: 'c11', name: 'Sports & Fitness', author: 'j.visser', uploadedOn: '2026-05-18', language: 'NL' },
  { id: 'c12', name: 'Days, Months, Time', author: 'f.haddad', uploadedOn: '2026-05-06', language: 'AR' },
  { id: 'c13', name: 'Colours & Shapes', author: 'n.volkov', uploadedOn: '2026-04-29', language: 'RU' },
  { id: 'c14', name: 'Fingerspelling Drills', author: 'maya.chen', uploadedOn: '2026-04-12', language: 'EN' },
  { id: 'c15', name: 'Weather & Seasons', author: 'yuki.tanaka', uploadedOn: '2026-03-30', language: 'JP' },
  { id: 'c16', name: 'Directions & Places', author: 'l.dubois', uploadedOn: '2026-03-17', language: 'FR' },
]

/** Codes actually present in the data, for the language filter. */
export const availableLanguages = [...new Set(communityEntries.map((e) => e.language))].sort()

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
