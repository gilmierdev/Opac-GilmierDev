export function now(): string {
  return new Date().toISOString()
}

export function toBool(value: number | boolean): boolean {
  return value === 1 || value === true
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function todayDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function todayIso(): string {
  return now()
}