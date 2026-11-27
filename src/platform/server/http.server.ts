/** Small helpers for the JSON API routes under src/routes/api/. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export function problem(message: string, status: number): Response {
  return json({ error: message }, status)
}

/** Turns a thrown error with a `status` into a JSON error response. */
export function fail(err: unknown): Response {
  if (err instanceof Error && 'status' in err && typeof err.status === 'number') {
    return problem(err.message, err.status)
  }
  console.error(err)
  return problem('Something went wrong on the server.', 500)
}

/**
 * Changes must come from Outpost's own pages. They send `X-Outpost: 1`; a
 * custom header can't be added to a cross-site request without a CORS
 * preflight, which this server never approves. So another website open on a
 * phone on the same Wi-Fi can't switch features or start an update.
 */
export function refuseCrossSite(request: Request): Response | null {
  return request.headers.get('x-outpost') === '1'
    ? null
    : problem('Missing the X-Outpost header. Changes must come from the Outpost app.', 403)
}

export async function readBody<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>
  } catch {
    return {}
  }
}
