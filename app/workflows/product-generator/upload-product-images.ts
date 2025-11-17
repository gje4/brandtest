import { ShopifyProduct } from './create-shopify-products';

export async function uploadProductImages(
  products: ShopifyProduct[]
): Promise<void> {
  // Note: 'use step' removed - when called from within a workflow with 'use workflow',
  // the steps are automatically tracked. The directive was causing return value issues.
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopifyDomain || !accessToken) {
    throw new Error(
      'Shopify credentials not configured. Please set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN environment variables.'
    );
  }

  // Normalize domain - remove https:// or http:// if present
  const normalizedDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  for (const product of products) {
    try {
      if (!product.image || product.image.length === 0) {
        continue; // Skip if no image data
      }

      // Extract base64 image data without data URI prefix
      // Handle various formats: data:image/png;base64, data:image/svg+xml;base64, etc.
      // Use more flexible regex that matches any MIME type (including svg+xml)
      let imageData = product.image;
      if (imageData.startsWith('data:image/')) {
        // Remove data URI prefix - match everything from data:image/ to ;base64,
        imageData = imageData.replace(/^data:image\/[^;]+;base64,/, '');
      } else if (imageData.includes('base64,')) {
        // Fallback: just remove everything before base64,
        imageData = imageData.substring(imageData.indexOf('base64,') + 7);
      }

      if (!imageData || imageData.length === 0) {
        continue; // Skip if no valid base64 data
      }

      // Determine image type from original data URI or default to PNG
      let imageExtension = 'png';
      const mimeTypeMatch = product.image.match(/data:image\/([^;]+)/);
      if (mimeTypeMatch) {
        const mimeType = mimeTypeMatch[1];
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
          imageExtension = 'jpg';
        } else if (mimeType.includes('png')) {
          imageExtension = 'png';
        } else if (mimeType.includes('webp')) {
          imageExtension = 'webp';
        } else if (mimeType.includes('svg')) {
          // Shopify might not accept SVG via base64 attachment
          // Convert to PNG or use a different approach
          imageExtension = 'png';
        }
      }

      // Upload image using ProductImage resource endpoint
      const imageUploadUrl = `https://${normalizedDomain}/admin/api/2025-07/products/${product.id}/images.json`;

      // Shopify API requires filename when using attachment
      const imagePayload = {
        image: {
          attachment: imageData,
          filename: `product-${product.id}-${Date.now()}.${imageExtension}`,
        },
      };

      const response = await fetch(imageUploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken.trim(),
        },
        body: JSON.stringify(imagePayload),
      });

      if (!response.ok) {
        // Continue to next product - don't fail entire batch
        continue;
      }
    } catch {
      // Continue to next product if image upload fails
      continue;
    }
  }
}

