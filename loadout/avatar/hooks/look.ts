// What a mascot is made of: pixels, and a form by model. Which family a theme calls for is families.ts's.
export type Pixels = readonly (readonly (number | null)[])[]
export type Form = 'opus' | 'sonnet' | 'haiku' | 'fable'
/** The cell-block stage's mini sets (minis.ts). */
export type Family = 'kirby' | 'clawd'

export const FORMS: readonly Form[] = ['opus', 'sonnet', 'haiku', 'fable']

/** A model id or alias as a form; one that names no family is `fallback`. */
export const formOf = (id: string, fallback: Form = 'opus'): Form =>
  FORMS.find(form => id.toLowerCase().includes(form)) ?? fallback
