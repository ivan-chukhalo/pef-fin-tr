export function isCategoryColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export function categoryColorStyle(color: string | null | undefined) {
  if (!isCategoryColor(color)) return undefined

  return {
    backgroundColor: `color-mix(in srgb, ${color} 32%, #18181b)`,
    borderColor: `color-mix(in srgb, ${color} 58%, #3f3f46)`,
  }
}
