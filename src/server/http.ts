import { auth } from '../lib/auth'

export async function requireUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user.id ?? null
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

export function fileStamp(): string {
  return new Date().toISOString().slice(0, 10)
}
