export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`
  if (gb >= 10) return `${Math.round(gb)} GB`
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}${hours ? `, ${hours} h` : ''}`
  if (hours > 0) return `${hours} h ${mins} min`
  return `${Math.max(mins, 1)} min`
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}
