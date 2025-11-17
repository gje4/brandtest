import { type NextRequest } from 'next/server'
import { OAuth2Client, type OAuth2Tokens } from 'arctic'
import { createSession, saveSession } from '@/lib/session/create'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()
  const storedState = cookieStore.get(`vercel_oauth_state`)?.value ?? null
  const storedVerifier = cookieStore.get(`vercel_oauth_code_verifier`)?.value ?? null
  const storedRedirectTo = cookieStore.get(`vercel_oauth_redirect_to`)?.value ?? null

  if (
    code === null ||
    state === null ||
    storedState !== state ||
    storedRedirectTo === null ||
    storedVerifier === null
  ) {
    return new Response(null, {
      status: 400,
    })
  }

  const client = new OAuth2Client(
    process.env.NEXT_PUBLIC_VERCEL_CLIENT_ID ?? '',
    process.env.VERCEL_CLIENT_SECRET ?? '',
    `${req.nextUrl.origin}/api/auth/callback/vercel`,
  )

  let tokens: OAuth2Tokens

  try {
    tokens = await client.validateAuthorizationCode('https://vercel.com/api/login/oauth/token', code, storedVerifier)
  } catch (error) {
    console.error('Failed to validate authorization code:', error)
    return new Response(null, {
      status: 400,
    })
  }

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: storedRedirectTo,
    },
  })

  try {
    const session = await createSession({
      accessToken: tokens.accessToken(),
      expiresAt: tokens.accessTokenExpiresAt().getTime(),
      refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
    })

    if (!session) {
      console.error('[Vercel Callback] Failed to create session - unable to fetch user from Vercel API')
      // Redirect to home with error message
      return Response.redirect(new URL('/?error=vercel_auth_failed', req.url))
    }

    // Note: Vercel tokens are already stored in users table by upsertUser() in createSession()

    await saveSession(response, session)

    cookieStore.delete(`vercel_oauth_state`)
    cookieStore.delete(`vercel_oauth_code_verifier`)
    cookieStore.delete(`vercel_oauth_redirect_to`)

    return response
  } catch (error) {
    // Check if this is a database error (table doesn't exist, etc.)
    const isDatabaseError =
      error instanceof Error &&
      (error.message.includes('relation') ||
        error.message.includes('does not exist') ||
        error.name === 'PostgresError' ||
        error.constructor.name === 'PostgresError')

    if (isDatabaseError) {
      console.error('[Vercel Callback] Database error:', error)
      return Response.redirect(new URL('/?error=db_setup_required', req.url))
    }

    // Re-throw other errors
    console.error('[Vercel Callback] Unexpected error:', error)
    throw error
  }
}
