import type { VercelUser } from './types'

export async function fetchUser(accessToken: string): Promise<VercelUser | undefined> {
  // Try multiple endpoints in order of preference
  const endpoints = [
    'https://api.vercel.com/v2/user',
    'https://api.vercel.com/v1/user',
    'https://vercel.com/api/www/user',
  ]

  let lastError: { status: number; body: string } | undefined

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })

      if (response.status === 200) {
        // Try to parse response - format may vary by endpoint
        const data = (await response.json()) as { user?: VercelUser } | VercelUser
        const user: VercelUser | undefined =
          'user' in data && data.user ? data.user : 'username' in data ? data : undefined

        if (user) {
          return user
        }
      } else {
        const errorText = await response.text()
        lastError = { status: response.status, body: errorText }
        console.error(`Failed to fetch user from ${endpoint}`, response.status, errorText)
      }
    } catch (error) {
      console.error(`Error fetching user from ${endpoint}:`, error)
      lastError = { status: 0, body: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // All endpoints failed
  if (lastError) {
    console.error('All Vercel user endpoints failed. Last error:', lastError)
  } else {
    console.error('Failed to fetch user from all endpoints')
  }

  return undefined
}
