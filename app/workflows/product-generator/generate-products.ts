import { generateText } from 'ai';
import { OrganizedInput } from './organize-input';

export interface GeneratedProduct {
  title: string;
  description: string;
  price: string;
  variants: Array<{
    title: string;
    price: string;
  }>;
  features: string[];
  image: string; // base64 data URI
  category: string;
}

/**
 * Detects if an image is a placeholder (SVG, simple graphic, or text overlay)
 */
function isPlaceholderImage(imageDataUri: string): boolean {
  // Check if it's an SVG (our fallback placeholder format)
  if (imageDataUri.includes('data:image/svg+xml')) {
    return true;
  }
  
  // Check if it contains common placeholder indicators in the base64 data
  // Placeholder images often have very uniform patterns or simple structures
  try {
    // Extract base64 part
    const base64Match = imageDataUri.match(/base64,(.+)/);
    if (!base64Match) return false;
    
    const base64Data = base64Match[1];
    // Decode a small sample to check for uniformity
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Very small images (< 1KB) are likely placeholders
    if (buffer.length < 1024) {
      return true;
    }
    
    // Check for high uniformity in pixel data (gray boxes)
    // Sample first 100 bytes - if they're mostly the same value, it's likely a placeholder
    const sampleSize = Math.min(100, buffer.length);
    const samples: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      samples.push(buffer[i]);
    }
    
    // If 80% of samples are within 10 of each other, likely a uniform placeholder
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const uniformCount = samples.filter(s => Math.abs(s - avg) < 10).length;
    if (uniformCount / samples.length > 0.8) {
      return true;
    }
  } catch (error) {
    // If we can't analyze, assume it's valid
    console.warn('Could not analyze image for placeholder detection:', error);
  }
  
  return false;
}

export async function generateProducts(
  organizedInput: OrganizedInput,
  sampleImage?: string | null
): Promise<GeneratedProduct[]> {
  // Note: 'use step' removed - when called from within a workflow with 'use workflow',
  // the steps are automatically tracked. The directive was causing return value issues.
  const allProducts: GeneratedProduct[] = [];

  // Iterate through each category
  for (const categoryData of organizedInput.categories) {
    const { category, count } = categoryData;

    // Generate products for this category
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      const maxRetries = 3;
      let productGenerated = false;
      
      while (!productGenerated && attempts < maxRetries) {
        attempts++;
        try {
          if (attempts > 1) {
            console.log(`[generateProducts] Retry attempt ${attempts} for ${category} product ${i + 1} due to placeholder image`);
          }
        // Build prompt with optional reference image instruction
        let imageInstruction = '';
        if (sampleImage) {
          imageInstruction = `
        REFERENCE IMAGE PROVIDED: Use the provided sample product image as a style and design reference. 
        Generate a similar product that:
        - Matches the visual style, quality, and presentation of the reference image
        - Has similar lighting, background, and composition
        - Maintains the professional ecommerce photography aesthetic
        - Creates a product that fits the same visual category and quality level
        
        `;
        }

        // Build prompt with retry-specific enhancements
        let retryEnhancement = '';
        if (attempts > 1) {
          retryEnhancement = `
        
        PREVIOUS ATTEMPTS FAILED: The previous image was a placeholder or generic graphic. You MUST generate a REAL PHOTOGRAPH of an actual physical product. This is a retry attempt ${attempts}/${maxRetries}.
        - DO NOT create simple graphics, gray boxes, or text overlays
        - DO NOT use placeholder images
        - Generate ONLY a real product photograph like you would see on Amazon, Nike, or other professional ecommerce sites
        - The image MUST show a tangible, physical product item with realistic textures and materials
        `;
        }
        
        const prompt = `Generate a realistic ecommerce product for the ${category} category. Create a specific, detailed product with a PHOTOGRAPHIC image of the actual product.
        
        ${imageInstruction}${retryEnhancement}
        CRITICAL IMAGE REQUIREMENTS - READ CAREFULLY:
        - The image MUST be a high-quality PHOTOGRAPH showing a REAL PHYSICAL PRODUCT
        - NO text, NO labels, NO category names, NO placeholders, NO gray boxes with text
        - The image must show the actual product item as it would appear in real life
        - Use professional product photography style (like Amazon, Nike, or premium ecommerce sites)
        - The product must be clearly visible with proper lighting
        - Use a clean, neutral background (white, light gray, or subtle gradient)
        - The product should be the main focus, centered and well-lit
        - Show the product from an angle that displays its features (not just front-on)
        - Include realistic textures, materials, and details that make it look like a real product photo
        
        DO NOT GENERATE:
        - Placeholder images
        - Gray squares with text
        - Simple graphics or icons
        - Category name labels
        - Generic stock photo templates
        
        DO GENERATE:
        - A real product photograph
        - High-resolution, detailed product image
        - Professional ecommerce-style product photography
        
        Create a specific product (not generic) with:
        1. A creative and specific product title (be very specific - not just "${category}", but something like "Modern Ergonomic Office Chair with Lumbar Support" or "Vintage Brown Leather Reclining Sofa" - make it a real, detailed product name)
        2. A detailed product description (2-3 paragraphs) that highlights key features, materials, dimensions, and benefits
        3. A realistic price in USD (format as a number like "99.99")
        4. At least 2 product variants with different options (e.g., size: Small/Large, color: Black/White, material: Leather/Fabric) and their prices
        5. A list of 3-5 key features
        
        Generate a high-quality, PHOTOGRAPHIC product image that shows the actual physical product item. This must be a real product photo, not a placeholder or graphic design.
        
        Format your response as JSON with the following structure:
        {
          "title": "Specific Product Title (not just category name)",
          "description": "Full product description with details about materials, features, dimensions...",
          "price": "99.99",
          "variants": [
            {"title": "Small / Black", "price": "79.99"},
            {"title": "Large / White", "price": "119.99"}
          ],
          "features": ["Feature 1", "Feature 2", "Feature 3"]
        }`;

        // Configure AI Gateway - The AI SDK expects AI_GATEWAY_API_KEY environment variable
        // Priority: AI_GATEWAY_API_KEY > VERCEL_AI_GATEWAY_KEY
        const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_KEY;
        
        if (!apiKey) {
          throw new Error(
            'AI Gateway API key not found. Please set AI_GATEWAY_API_KEY in your .env.local file. ' +
            'Get your API key from: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys'
          );
        }

        // Configure the generateText call
        // The AI SDK will automatically use AI_GATEWAY_API_KEY from env, but we can also pass it explicitly
        const gatewayUrl = process.env.VERCEL_AI_GATEWAY_URL || process.env.AI_GATEWAY_URL;
        
        const config: {
          model: string;
          providerOptions: { google: { responseModalities: string[] } };
          apiKey: string;
          baseURL?: string;
        } = {
          model: 'google/gemini-2.5-flash-image-preview',
          providerOptions: {
            google: { responseModalities: ['TEXT', 'IMAGE'] },
          },
          apiKey: apiKey,
        };

        // Add gateway URL if provided (optional - AI Gateway usually works without it)
        if (gatewayUrl) {
          config.baseURL = gatewayUrl;
        }

        // When a sample image is provided, enhance the prompt to reference it
        // The AI will use the enhanced prompt description to generate similar images
        const finalPrompt = sampleImage 
          ? `${prompt}\n\nNote: A reference sample image has been provided. Generate the product image to match the visual style, quality, composition, and aesthetic of sample product images in the same category.`
          : prompt;

        const result = await generateText({
          ...config,
          prompt: finalPrompt,
        });

        // Extract text response
        let productData: Omit<GeneratedProduct, 'image' | 'category'>;
        try {
          // Try to parse JSON from the response
          const jsonMatch = result.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            productData = JSON.parse(jsonMatch[0]);
          } else {
            // Fallback: extract structured data from text
            productData = {
              title: result.text.split('\n')[0] || `Premium ${category} ${i + 1}`,
              description: result.text,
              price: '99.99',
              variants: [
                { title: 'Standard', price: '99.99' },
                { title: 'Premium', price: '149.99' },
              ],
              features: ['High quality', 'Durable', 'Modern design'],
            };
          }
        } catch (parseError) {
          // Fallback to basic structure if JSON parsing fails
          console.warn(`Failed to parse JSON for ${category} product:`, parseError);
          productData = {
            title: `Premium ${category} ${i + 1}`,
            description: result.text || `A high-quality ${category} with excellent features.`,
            price: '99.99',
            variants: [
              { title: 'Standard', price: '99.99' },
              { title: 'Premium', price: '149.99' },
            ],
            features: ['High quality', 'Durable', 'Modern design'],
          };
        }

        // Extract generated images
        const imageFiles = result.files.filter((f) =>
          f.mediaType?.startsWith('image/')
        );

        let imageDataUri = '';
        if (imageFiles.length > 0) {
          // Use the first image
          const imageFile = imageFiles[0];
          if (imageFile.base64) {
            imageDataUri = `data:${imageFile.mediaType};base64,${imageFile.base64}`;
          } else if (imageFile.uint8Array) {
            // Convert uint8Array to base64
            const base64 = Buffer.from(imageFile.uint8Array).toString('base64');
            imageDataUri = `data:${imageFile.mediaType};base64,${base64}`;
          }
        }

        // If no image was generated, create a placeholder data URI
        if (!imageDataUri) {
          imageDataUri = `data:image/svg+xml;base64,${Buffer.from(
            `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#f0f0f0"/><text x="50%" y="50%" font-family="Arial" font-size="20" fill="#666" text-anchor="middle" dominant-baseline="middle">${category}</text></svg>`
          ).toString('base64')}`;
        }

        // Check if the generated image is a placeholder
        const isPlaceholder = isPlaceholderImage(imageDataUri);
        
        if (isPlaceholder && attempts < maxRetries) {
          console.warn(`[generateProducts] Detected placeholder image for ${category} product ${i + 1}, retrying with stronger prompt...`);
          // Continue to retry - don't add to products yet
          continue;
        }

        // If we have a placeholder after max retries, log it but still add the product
        if (isPlaceholder) {
          console.warn(`[generateProducts] Placeholder image still detected after ${maxRetries} attempts for ${category} product ${i + 1}, using it anyway`);
        }

        allProducts.push({
          ...productData,
          image: imageDataUri,
          category,
        });
        
        productGenerated = true;
      } catch (error) {
          // If this is not the last attempt, log and continue retrying
          if (attempts < maxRetries) {
            console.warn(`[generateProducts] Error on attempt ${attempts} for ${category} product ${i + 1}, retrying...`, error);
            continue;
          }
          
          // Last attempt failed - create a fallback product
          console.error(`Failed to generate product for ${category} after ${maxRetries} attempts:`, error);
          allProducts.push({
            title: `${category} ${i + 1}`,
            description: `A high-quality ${category} with excellent features and modern design.`,
            price: '99.99',
            variants: [
              { title: 'Standard', price: '99.99' },
            ],
            features: ['High quality', 'Durable', 'Modern design'],
            image: `data:image/svg+xml;base64,${Buffer.from(
              `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#f0f0f0"/><text x="50%" y="50%" font-family="Arial" font-size="20" fill="#666" text-anchor="middle" dominant-baseline="middle">${category}</text></svg>`
            ).toString('base64')}`,
            category,
          });
          productGenerated = true; // Exit the retry loop
        }
      }
    }
  }

  console.log('[generateProducts] About to return. Total products:', allProducts.length);
  console.log('[generateProducts] Return value is array:', Array.isArray(allProducts));
  
  // Explicitly ensure we return the array
  const returnValue: GeneratedProduct[] = allProducts;
  console.log('[generateProducts] Returning', returnValue.length, 'products');
  return returnValue;
}

