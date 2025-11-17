'use server';

import { productGeneratorWorkflow } from '@/app/workflows/product-generator';
import type { CategoryInput } from '@/app/workflows/product-generator';

// Call the workflow function directly
// The 'use workflow' directive and withWorkflow() in next.config.ts 
// automatically handle workflow detection and tracking in Vercel dashboard
export async function triggerProductGeneratorWorkflow(
  categories: CategoryInput[],
  sampleImage?: string | null
) {
  return await productGeneratorWorkflow(categories, sampleImage);
}

