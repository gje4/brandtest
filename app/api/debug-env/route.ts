import { NextResponse } from 'next/server';

// Debug endpoint to check environment variables (don't use in production!)
export async function GET() {
  return NextResponse.json({
    hasShopifyDomain: !!process.env.SHOPIFY_STORE_DOMAIN,
    hasShopifyToken: !!process.env.SHOPIFY_ACCESS_TOKEN,
    hasAiGatewayKey: !!(process.env.VERCEL_AI_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY),
    hasAiGatewayUrl: !!(process.env.VERCEL_AI_GATEWAY_URL || process.env.AI_GATEWAY_URL),
    // Don't expose actual values for security
    shopifyDomainPrefix: process.env.SHOPIFY_STORE_DOMAIN?.substring(0, 10) || 'not set',
    shopifyTokenPrefix: process.env.SHOPIFY_ACCESS_TOKEN?.substring(0, 10) || 'not set',
    aiGatewayKeyPrefix: (process.env.VERCEL_AI_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY)?.substring(0, 10) || 'not set',
  });
}

