import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local (or .env as fallback)
const envLocal = resolve(process.cwd(), '.env.local')
const envFile = resolve(process.cwd(), '.env')

// Try .env.local first, then fall back to .env
config({ path: envLocal })
config({ path: envFile })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
})
