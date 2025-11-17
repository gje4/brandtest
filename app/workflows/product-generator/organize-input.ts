export interface CategoryInput {
  category: string;
  count: number;
}

export interface OrganizedInput {
  categories: CategoryInput[];
  totalProducts: number;
}

export async function organizeInput(categories: CategoryInput[]): Promise<OrganizedInput> {
  'use step';
  
  try {
    console.log('[organizeInput] Starting with categories:', JSON.stringify(categories));
    console.log('[organizeInput] Categories type:', typeof categories, 'Is array:', Array.isArray(categories));
    
    // Validate inputs
    if (!Array.isArray(categories) || categories.length === 0) {
      console.error('[organizeInput] Categories array is invalid or empty');
      throw new Error('Categories array is required and cannot be empty');
    }

    if (categories.length > 10) {
      console.error('[organizeInput] Too many categories:', categories.length);
      throw new Error('Maximum 10 categories allowed');
    }

    // Validate and filter valid categories
    const validCategories = categories.filter((cat) => {
      if (!cat || !cat.category || typeof cat.category !== 'string') {
        console.warn('[organizeInput] Invalid category (missing name):', cat);
        return false;
      }
      if (typeof cat.count !== 'number' || cat.count < 1 || cat.count > 100) {
        console.warn('[organizeInput] Invalid category count:', cat);
        return false;
      }
      return true;
    });

    console.log('[organizeInput] Valid categories after filtering:', validCategories.length);

    if (validCategories.length === 0) {
      console.error('[organizeInput] No valid categories found');
      throw new Error('No valid categories found. Each category needs a name and count between 1-100');
    }

    const totalProducts = validCategories.reduce((sum, cat) => sum + cat.count, 0);
    const result: OrganizedInput = {
      categories: validCategories.map((cat) => ({
        category: cat.category.trim(),
        count: cat.count,
      })),
      totalProducts,
    };

    console.log('[organizeInput] About to return result:', JSON.stringify(result));
    console.log('[organizeInput] Result type:', typeof result);
    console.log('[organizeInput] Result has totalProducts:', 'totalProducts' in result);
    
    // Explicitly return to ensure Workflows transformation preserves it
    const returnValue: OrganizedInput = result;
    console.log('[organizeInput] Returning:', JSON.stringify(returnValue));
    return returnValue;
  } catch (error) {
    console.error('[organizeInput] Error caught in function:', error);
    throw error;
  }
}

