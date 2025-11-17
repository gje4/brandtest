'use workflow';

import { CategoryInput, OrganizedInput } from './organize-input';

// Re-export CategoryInput for use in Server Actions and API routes
export type { CategoryInput } from './organize-input';
import { generateProducts, GeneratedProduct } from './generate-products';
import { createShopifyProducts, ShopifyProduct } from './create-shopify-products';
import { uploadProductImages } from './upload-product-images';

export interface WorkflowResult {
  success: boolean;
  totalProducts: number;
  createdProducts: ShopifyProduct[];
  errors?: string[];
}

export async function productGeneratorWorkflow(
  categories: CategoryInput[],
  sampleImage?: string | null
): Promise<WorkflowResult> {
  console.log('[Workflow] Starting productGeneratorWorkflow');
  console.log('[Workflow] Input categories:', JSON.stringify(categories));
  console.log('[Workflow] Sample image provided:', !!sampleImage);
  
  const errors: string[] = [];
  let organizedInput: OrganizedInput;
  let generatedProducts: GeneratedProduct[] = [];
  let createdProducts: ShopifyProduct[] = [];

  try {
    // Step 1: Organize Input
    console.log('[Workflow] Step 1: Organizing input...');
    console.log('[Workflow] Categories type:', typeof categories, 'Is array:', Array.isArray(categories));
    
    // Inline the organizeInput logic to avoid transformation issues
    if (!Array.isArray(categories) || categories.length === 0) {
      throw new Error('Categories array is required and cannot be empty');
    }

    if (categories.length > 10) {
      throw new Error('Maximum 10 categories allowed');
    }

    // Validate and filter valid categories
    const validCategories = categories.filter((cat) => {
      if (!cat || !cat.category || typeof cat.category !== 'string') {
        return false;
      }
      if (typeof cat.count !== 'number' || cat.count < 1 || cat.count > 100) {
        return false;
      }
      return true;
    });

    if (validCategories.length === 0) {
      throw new Error('No valid categories found. Each category needs a name and count between 1-100');
    }

    const totalProducts = validCategories.reduce((sum, cat) => sum + cat.count, 0);
    organizedInput = {
      categories: validCategories.map((cat) => ({
        category: cat.category.trim(),
        count: cat.count,
      })),
      totalProducts,
    };
    
    console.log('[Workflow] Step 1 complete. Total products to generate:', organizedInput.totalProducts);
    console.log('[Workflow] Organized categories:', JSON.stringify(organizedInput.categories));
  } catch (error) {
    const errorMsg = `Step 1 failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('[Workflow] Step 1 error:', errorMsg, error);
    console.error('[Workflow] Error stack:', error instanceof Error ? error.stack : 'No stack');
    errors.push(errorMsg);
    return {
      success: false,
      totalProducts: 0,
      createdProducts: [],
      errors,
    };
  }

  try {
    // Step 2: Generate Product Data (with images)
    console.log('[Workflow] Step 2: Generating products...');
    const result = await generateProducts(organizedInput, sampleImage);
    console.log('[Workflow] Step 2 result received:', result);
    console.log('[Workflow] Step 2 result type:', typeof result, 'Is array:', Array.isArray(result));
    
    if (result === null || result === undefined) {
      console.error('[Workflow] generateProducts returned null or undefined');
      throw new Error('generateProducts returned null or undefined');
    }
    
    if (!Array.isArray(result)) {
      console.error('[Workflow] generateProducts returned non-array:', typeof result);
      throw new Error(`generateProducts returned invalid type: ${typeof result}, expected array`);
    }
    
    generatedProducts = result;
    console.log('[Workflow] Step 2 complete. Generated', generatedProducts.length, 'products');
  } catch (error) {
    const errorMsg = `Step 2 failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('[Workflow] Step 2 error:', errorMsg, error);
    errors.push(errorMsg);
    return {
      success: false,
      totalProducts: organizedInput?.totalProducts || 0,
      createdProducts: [],
      errors,
    };
  }

  try {
    // Step 3: Create Shopify Products (without images)
    console.log('[Workflow] Step 3: Creating Shopify products...');
    createdProducts = await createShopifyProducts(generatedProducts);
    console.log('[Workflow] Step 3 complete. Created', createdProducts.length, 'Shopify products');
  } catch (error) {
    const errorMsg = `Step 3 failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('[Workflow] Step 3 error:', errorMsg, error);
    errors.push(errorMsg);
    // Still return partial success if some products were created
    return {
      success: createdProducts.length > 0,
      totalProducts: organizedInput.totalProducts,
      createdProducts,
      errors,
    };
  }

  try {
    // Step 4: Upload Product Images
    console.log('[Workflow] Step 4: Uploading product images...');
    await uploadProductImages(createdProducts);
    console.log('[Workflow] Step 4 complete. Images uploaded');
  } catch (error) {
    const errorMsg = `Step 4 failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('[Workflow] Step 4 error:', errorMsg, error);
    errors.push(errorMsg);
    // Continue - products are created, just images failed
  }

  console.log('[Workflow] Workflow complete. Success:', true, 'Total:', organizedInput.totalProducts, 'Created:', createdProducts.length);
  
  return {
    success: true,
    totalProducts: organizedInput.totalProducts,
    createdProducts,
    errors: errors.length > 0 ? errors : undefined,
  };
}

