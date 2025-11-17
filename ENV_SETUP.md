# Environment Variables Setup

## Required Environment Variables

Create a `.env.local` file in the root of your project with the following variables:

```bash
# Vercel AI Gateway Configuration
# IMPORTANT: Use AI_GATEWAY_API_KEY (the AI SDK specifically looks for this)
AI_GATEWAY_API_KEY=your_ai_gateway_api_key_here
# Optional: AI Gateway URL (usually not needed)
# VERCEL_AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1

# Database & Encryption
POSTGRES_URL=postgresql://user:password@host:5432/db
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWE_SECRET=$(openssl rand -base64 32 | tr '+/' '-_' | cut -c1-43)

# Primary Auth Providers
NEXT_PUBLIC_VERCEL_CLIENT_ID=your_vercel_oauth_client_id
VERCEL_CLIENT_SECRET=your_vercel_oauth_client_secret
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_app_client_id
GITHUB_CLIENT_SECRET=your_github_app_client_secret

# Shopify Configuration
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token_here

# v0 Platform API Configuration
V0_API_KEY=your_v0_api_key_here
```

## Important Notes

1. **No quotes needed**: Don't wrap values in quotes unless the value itself contains spaces
   - ✅ `SHOPIFY_STORE_DOMAIN=my-store.myshopify.com`
   - ❌ `SHOPIFY_STORE_DOMAIN="my-store.myshopify.com"`

2. **No spaces around equals sign**:
   - ✅ `KEY=value`
   - ❌ `KEY = value`

3. **Restart your dev server** after creating or modifying `.env.local`:
   ```bash
   # Stop the server (Ctrl+C) and restart:
   npm run dev
   ```

4. **OAuth & crypto keys**:
   - Generate `ENCRYPTION_KEY` once with `openssl rand -hex 32`
   - Generate `JWE_SECRET` once (43 URL-safe base64 characters)
   - GitHub app must enable OAuth with callback `https://your-domain/api/auth/github/callback`
   - Vercel OAuth app callback should be `https://your-domain/api/auth/callback/vercel`

5. **AI Gateway priority**:
   - `AI_GATEWAY_API_KEY` (recommended)
   - `VERCEL_AI_GATEWAY_KEY` (fallback)
   - `VERCEL_AI_GATEWAY_URL` or `AI_GATEWAY_URL` (optional gateway URL)

## Debug Endpoint

Visit `/api/debug-env` to check if your environment variables are being loaded correctly.

## Getting Your API Keys

### Vercel AI Gateway Key
1. Go to [Vercel AI Gateway API Keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys)
2. Create a new API key or copy an existing one
3. Add it to your `.env.local` as `AI_GATEWAY_API_KEY`

### Shopify Access Token
1. Go to your Shopify Admin
2. Navigate to Settings > Apps and sales channels > Develop apps
3. Create a new app or use an existing one
4. Configure Admin API access scopes (read_products, write_products)
5. Install the app and copy the Admin API access token

### v0 Platform API Key
1. Go to [v0.dev/chat/settings/keys](https://v0.dev/chat/settings/keys)
2. Create a new API key or copy an existing one
3. Add it to your `.env.local` as `V0_API_KEY`

### GitHub OAuth App
1. Create an OAuth app at [GitHub Developer Settings](https://github.com/settings/developers)
2. Set the callback URL to `https://localhost:3000/api/auth/github/callback` (adjust for prod)
3. Copy the Client ID/Secret into `NEXT_PUBLIC_GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
4. Grant `repo`, `read:user`, and `user:email` scopes

### Vercel OAuth App
1. Visit [Vercel OAuth Apps](https://vercel.com/account/oauth)
2. Create an app with callback `https://localhost:3000/api/auth/callback/vercel`
3. Paste the Client ID/Secret into `NEXT_PUBLIC_VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET`

### Database & Secrets
1. Provision a Postgres database (Vercel Postgres or local)
2. Set `POSTGRES_URL` to the connection string
3. Generate `ENCRYPTION_KEY` and `JWE_SECRET` once and store them securely

