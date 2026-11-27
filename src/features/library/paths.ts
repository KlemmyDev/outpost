/** Encodes each segment of a path inside a book, keeping the slashes. */
export function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
}
