export function nowIso(): string {
  return new Date().toISOString()
}

/** Converts a pg value (Date or string) to an ISO-8601 string for the renderer. */
export function toIso(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't'
}

export function toInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function toNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return toIso(value)
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}