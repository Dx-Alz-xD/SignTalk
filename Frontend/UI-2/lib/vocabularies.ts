/**
 * Stand-in for the stored vocabularies until the backend is wired up. The
 * shape mirrors what the trainer will read back: an id, the name given at
 * creation, and the sign language it was recorded in.
 */
export type Vocabulary = {
  id: string
  name: string
  language: string
  /** Signs recorded so far, shown as a mono count on the row. */
  signs: number
  phrases: boolean
}

export const vocabularies: Vocabulary[] = [
  { id: 'v1', name: 'Everyday greetings', language: 'ASL', signs: 24, phrases: true },
  { id: 'v2', name: 'Alphabet', language: 'ASL', signs: 26, phrases: false },
  { id: 'v3', name: 'Numbers 0-20', language: 'ISL', signs: 21, phrases: false },
  { id: 'v4', name: 'Classroom phrases', language: 'ISL', signs: 18, phrases: true },
  { id: 'v5', name: 'Medical basics', language: 'BSL', signs: 12, phrases: true },
]
