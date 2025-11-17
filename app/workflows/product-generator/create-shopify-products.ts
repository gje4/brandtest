import { GeneratedProduct } from './generate-products';

export interface ShopifyProduct {
  id: string;
  title: string;
  image: string; // Keep image data for separate upload step
}

export async function createShopifyProducts(
  products: GeneratedProduct[]
): Promise<ShopifyProduct[]> {
  // Note: 'use step' removed - when called from within a workflow with 'use workflow',
  // the steps are automatically tracked. The directive was causing return value issues.
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopifyDomain || !accessToken) {
    throw new Error(
      `Shopify credentials not configured. Please set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN environment variables.
      Found SHOPIFY_STORE_DOMAIN: ${shopifyDomain ? 'yes' : 'no'}
      Found SHOPIFY_ACCESS_TOKEN: ${accessToken ? 'yes' : 'no'}`
    );
  }

  // Normalize domain - remove https:// or http:// if present
  const normalizedDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const createdProducts: ShopifyProduct[] = [];

  for (const product of products) {
    try {

      // Shopify requires variants to have option1, option2, option3 instead of title
      // The title is computed from the options. For simple variants, use option1.
      // Ensure variant option values are unique to avoid conflicts
      const variants = product.variants.length > 0 
        ? product.variants.map((variant, index) => {
            // Make variant option unique if duplicates exist
            const optionValue = variant.title || `Option ${index + 1}`;
            const seenValues = new Set();
            const uniqueOptionValue = seenValues.has(optionValue) 
              ? `${optionValue} ${index + 1}` 
              : optionValue;
            seenValues.add(uniqueOptionValue);
            
            return {
              option1: uniqueOptionValue,
              price: variant.price,
              position: index + 1,
              inventory_management: null, // Set to null to allow unlimited inventory
            };
          })
        : [
            // Default variant if none provided
            {
              option1: 'Default',
              price: product.price || '0.00',
              position: 1,
              inventory_management: null,
            },
          ];

      // Define the product options (e.g., "Size", "Color", "Variant")
      // For now, we'll use a generic "Variant" option name
      const productOptions = product.variants.length > 0 
        ? [{ name: 'Variant' }] 
        : [];

      // Create product payload WITHOUT images first
      // According to Shopify API docs, we'll upload images separately after product creation
      const productPayload: {
        product: {
          title: string;
          body_html: string;
          vendor: string;
          product_type: string;
          variants: Array<{
            option1: string;
            price: string;
            position: number;
            inventory_management: null;
          }>;
          options?: Array<{ name: string }>;
        };
      } = {
        product: {
          title: product.title,
          body_html: `<p>${product.description.replace(/\n/g, '</p><p>')}</p>`,
          vendor: 'AI Generated',
          product_type: product.category,
          variants: variants,
        },
      };

      // Add options array if we have variants (defines what the variant options represent)
      if (productOptions.length > 0) {
        productPayload.product.options = productOptions;
      }

      // Step 1: Create the product
      const createProductUrl = `https://${normalizedDomain}/admin/api/2025-07/products.json`;
      const createResponse = await fetch(createProductUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken.trim(),
        },
        body: JSON.stringify(productPayload),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        
        if (createResponse.status === 401) {
          throw new Error(
            `Shopify authentication failed (401). Please verify:
            1. Your SHOPIFY_ACCESS_TOKEN is correct and active
            2. The token has 'write_products' scope
            3. The token hasn't been revoked or regenerated
            4. Your SHOPIFY_STORE_DOMAIN is correct (should be: your-store.myshopify.com)
            
            Error details: ${errorText}
            
            To get a new token:
            1. Go to Shopify Admin > Settings > Apps and sales channels
            2. Click "Develop apps" > Create an app
            3. Configure Admin API scopes (check 'write_products')
            4. Install the app and copy the Admin API access token`
          );
        }

        if (createResponse.status === 422) {
          throw new Error(
            `Shopify validation error (422). Common issues:
            1. Duplicate variant titles - ensure variant options are unique
            2. Invalid product data format
            3. Missing required fields
            
            Error details: ${errorText}`
          );
        }
        
        throw new Error(`Shopify API error: ${createResponse.status} - ${errorText}`);
      }

      const createResult = await createResponse.json();
      const productId = createResult.product?.id;

      if (!productId) {
        throw new Error('Product created but no ID returned from Shopify');
      }

      // Store product with image data - images will be uploaded in a separate step
      createdProducts.push({
        id: productId.toString(),
        title: createResult.product.title,
        image: product.image, // Keep image for separate upload step
      });
    } catch {
      // Continue with next product instead of failing entirely
      // In production, you might want to log this to a retry queue
    }
  }

  return createdProducts;
}

