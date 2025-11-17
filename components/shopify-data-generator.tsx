'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'

interface Category {
  category: string
  count: number
}

interface WorkflowResult {
  success: boolean
  totalProducts?: number
  createdProducts?: any[]
  errors?: string[]
  v0ProjectUrl?: string
}

export function ShopifyDataGenerator() {
  const [categories, setCategories] = useState<Category[]>([{ category: '', count: 1 }])
  const [sampleImage, setSampleImage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null)
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateCategory = (index: number, field: keyof Category, value: string | number) => {
    const newCategories = [...categories]
    newCategories[index] = { ...newCategories[index], [field]: value }
    setCategories(newCategories)
  }

  const addCategory = () => {
    if (categories.length < 10) {
      setCategories([...categories, { category: '', count: 1 }])
    }
  }

  const removeCategory = (index: number) => {
    if (categories.length > 1) {
      setCategories(categories.filter((_, i) => i !== index))
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file size (2MB limit)
      const maxSize = 2 * 1024 * 1024 // 2MB
      if (file.size > maxSize) {
        setError('Image size must be less than 2MB')
        return
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('File must be an image')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSampleImage(reader.result)
          setError(null)
        }
      }
      reader.onerror = () => {
        setError('Failed to read image file')
      }
      reader.readAsDataURL(file)
    }
  }

  const removeSampleImage = () => {
    setSampleImage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    setWorkflowId(null)
    setWorkflowStatus(null)
    setWorkflowResult(null)

    try {
      // Validate categories
      const validCategories = categories.filter((cat) => cat.category.trim())
      if (validCategories.length === 0) {
        setError('Please add at least one category')
        setIsSubmitting(false)
        return
      }

      console.log('[ShopifyDataGenerator] Starting workflow with categories:', validCategories)
      console.log('[ShopifyDataGenerator] Sample image provided:', !!sampleImage)

      setWorkflowStatus('Processing workflow...')

      // Call the actual server action
      const { triggerProductGeneratorWorkflow } = await import('@/app/actions/workflow')
      const result = await triggerProductGeneratorWorkflow(validCategories, sampleImage)

      console.log('[ShopifyDataGenerator] Workflow result:', result)

      setWorkflowId(`workflow-${Date.now()}`)
      setWorkflowStatus(result.success ? 'completed' : 'failed')
      setWorkflowResult(result)

      if (!result.success) {
        setError(result.errors?.join(', ') || 'Workflow failed')
      }
    } catch (err) {
      console.error('[ShopifyDataGenerator] Workflow error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to start workflow'
      setError(errorMessage)
      setWorkflowStatus('failed')
      setWorkflowResult({
        success: false,
        totalProducts: 0,
        createdProducts: [],
        errors: [errorMessage],
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-7xl flex-col items-center justify-center py-16 px-8">
        <div className="w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-black dark:text-zinc-50">
              Shopify Data Generator
            </h1>
            <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              Generate AI-powered products for your Shopify store
            </p>
          </div>

          <div className="w-full">
            {/* Product Generator Form */}
            <div className="mx-auto max-w-2xl space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  {categories.map((cat, index) => (
                    <div
                      key={index}
                      className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex-1">
                        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Category Name
                        </label>
                        <input
                          type="text"
                          value={cat.category}
                          onChange={(e) => updateCategory(index, 'category', e.target.value)}
                          placeholder="e.g., Chairs"
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                          required
                        />
                      </div>
                      <div className="w-32">
                        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Count</label>
                        <input
                          type="number"
                          value={cat.count}
                          onChange={(e) => updateCategory(index, 'count', parseInt(e.target.value) || 1)}
                          min="1"
                          max="100"
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                          required
                        />
                      </div>
                      {categories.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCategory(index)}
                          className="mt-6 rounded-md bg-red-500 px-4 py-2 text-white hover:bg-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {categories.length < 10 && (
                  <button
                    type="button"
                    onClick={addCategory}
                    className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    + Add Category ({categories.length}/10)
                  </button>
                )}

                {/* Sample Image Upload Section */}
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Sample Product Image (Optional)
                  </label>
                  <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Upload a reference image to generate similar products
                  </p>
                  {sampleImage ? (
                    <div className="space-y-2">
                      <div className="relative w-full overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
                        <Image
                          src={sampleImage}
                          alt="Sample product"
                          width={400}
                          height={300}
                          className="h-auto w-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={removeSampleImage}
                        className="w-full rounded-md bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
                      >
                        Remove Image
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 dark:border-zinc-700 dark:file:bg-zinc-100 dark:file:text-zinc-900"
                      />
                    </div>
                  )}
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {error}
                  </div>
                )}

                {/* Workflow Status */}
                {isSubmitting && (
                  <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100">
                          {workflowStatus || 'Processing workflow...'}
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">This may take a few minutes</p>
                      </div>
                    </div>
                  </div>
                )}

                {workflowId && !isSubmitting && (
                  <div className="space-y-3">
                    {/* v0 Project Link - Show above results when available */}
                    {workflowResult?.v0ProjectUrl && (
                      <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <a
                          href={workflowResult.v0ProjectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-3 text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          <span className="font-medium">View in v0</span>
                        </a>
                      </div>
                    )}

                    <div
                      className={`rounded-md p-4 ${
                        workflowStatus === 'completed'
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : workflowStatus === 'failed'
                            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}
                    >
                      <p className="font-medium">
                        {workflowStatus === 'completed'
                          ? 'Workflow completed successfully!'
                          : workflowStatus === 'failed'
                            ? 'Workflow failed'
                            : 'Workflow started'}
                      </p>
                      <p className="mt-1 text-sm">ID: {workflowId}</p>
                    </div>

                    {workflowResult && (
                      <div className="rounded-md bg-zinc-50 p-4 dark:bg-zinc-900/50">
                        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Results:</p>
                        <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                          <p>Success: {workflowResult.success ? 'Yes' : 'No'}</p>
                          <p>Total Products: {workflowResult.totalProducts || 0}</p>
                          <p>Created: {workflowResult.createdProducts?.length || 0}</p>
                          {workflowResult.errors && workflowResult.errors.length > 0 && (
                            <div className="mt-2">
                              <p className="font-medium text-red-600 dark:text-red-400">Errors:</p>
                              <ul className="mt-1 list-inside list-disc">
                                {workflowResult.errors.map((err: string, idx: number) => (
                                  <li key={idx}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-md bg-zinc-900 px-6 py-3 text-lg font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSubmitting ? 'Starting Workflow...' : 'Generate Products'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
