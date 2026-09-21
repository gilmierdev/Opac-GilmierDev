/** Throws a descriptive error when a service is not available in this mode. */
export function requireService<T>(service: T | null, label: string): T {
  if (!service) {
    throw new Error(`${label} is not available in this mode`)
  }
  return service
}