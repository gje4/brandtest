import { NextRequest, NextResponse } from 'next/server';
import { triggerProductGeneratorWorkflow } from '@/app/actions/workflow';

export async function POST(request: NextRequest) {
  try {
    // Handle both FormData (with image) and JSON
    const contentType = request.headers.get('content-type') || '';
    let categories: any;
    let sampleImage: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const categoriesStr = formData.get('categories') as string;
      
      if (!categoriesStr) {
        return NextResponse.json(
          { error: 'Categories are required' },
          { status: 400 }
        );
      }

      categories = JSON.parse(categoriesStr);
      const imageData = formData.get('sampleImage') as string | null;
      if (imageData) {
        sampleImage = imageData;
      }
    } else {
      const body = await request.json();
      categories = body.categories;
    }

    if (!categories || !Array.isArray(categories)) {
      return NextResponse.json(
        { error: 'Categories array is required' },
        { status: 400 }
      );
    }

    if (categories.length === 0) {
      return NextResponse.json(
        { error: 'At least one category is required' },
        { status: 400 }
      );
    }

    if (categories.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 categories allowed' },
        { status: 400 }
      );
    }

    // Generate a workflow ID for tracking
    const workflowId = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[Workflow API] Starting workflow ${workflowId}`);
    console.log(`[Workflow API] Categories:`, JSON.stringify(categories));
    console.log(`[Workflow API] Categories type:`, typeof categories, 'Is array:', Array.isArray(categories));
    console.log(`[Workflow API] Sample image provided:`, !!sampleImage);

    // Trigger the workflow through the Server Action wrapper
    // This ensures the workflow is properly tracked in the Vercel dashboard
    const startTime = Date.now();
    let result;
    
    try {
      result = await triggerProductGeneratorWorkflow(categories, sampleImage);
      const duration = Date.now() - startTime;
      console.log(`[Workflow API] Workflow ${workflowId} completed in ${duration}ms`);
      console.log(`[Workflow API] Success: ${result.success}, Products created: ${result.createdProducts.length}/${result.totalProducts}`);
      
      if (result.errors && result.errors.length > 0) {
        console.error(`[Workflow API] Errors:`, result.errors);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Workflow API] Workflow ${workflowId} failed after ${duration}ms:`, error);
      throw error;
    }

    return NextResponse.json({
      workflowId,
      status: result.success ? 'completed' : 'failed',
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

