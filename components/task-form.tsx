'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, ArrowUp, Settings, X, Cable, Users, Image as ImageIcon } from 'lucide-react'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode, V0 } from '@/components/logos'
import { setInstallDependencies, setMaxDuration, setKeepAlive } from '@/lib/utils/cookies'
import { useConnectors } from '@/components/connectors-provider'
import { ConnectorDialog } from '@/components/connectors/manage-connectors'
import { toast } from 'sonner'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { taskPromptAtom } from '@/lib/atoms/task'
import { lastSelectedAgentAtom, lastSelectedModelAtomFamily } from '@/lib/atoms/agent-selection'
import { githubReposAtomFamily } from '@/lib/atoms/github-cache'
import { useSearchParams } from 'next/navigation'
import { sessionAtom } from '@/lib/atoms/session'

interface GitHubRepo {
  name: string
  full_name: string
  description: string
  private: boolean
  clone_url: string
  language: string
}

interface TaskFormProps {
  onSubmit: (data: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
    selectedModels?: string[]
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
    images?: string[] // Array of base64-encoded image data URIs
    createNewRepo?: boolean
    newRepoOwner?: string
  }) => void
  isSubmitting: boolean
  selectedOwner: string
  selectedRepo: string
  initialInstallDependencies?: boolean
  initialMaxDuration?: number
  initialKeepAlive?: boolean
  maxSandboxDuration?: number
}

const CODING_AGENTS = [
  { value: 'multi-agent', label: 'Compare', icon: Users, isLogo: false },
  { value: 'divider', label: '', icon: () => null, isLogo: false, isDivider: true },
  { value: 'claude', label: 'Claude', icon: Claude, isLogo: true },
  { value: 'codex', label: 'Codex', icon: Codex, isLogo: true },
  { value: 'copilot', label: 'Copilot', icon: Copilot, isLogo: true },
  { value: 'cursor', label: 'Cursor', icon: Cursor, isLogo: true },
  { value: 'gemini', label: 'Gemini', icon: Gemini, isLogo: true },
  { value: 'opencode', label: 'opencode', icon: OpenCode, isLogo: true },
  { value: 'v0', label: 'V0', icon: V0, isLogo: true },
] as const

// Model options for each agent
const AGENT_MODELS = {
  claude: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
  ],
  codex: [
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
    { value: 'gpt-5-pro', label: 'GPT-5 pro' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
  ],
  copilot: [
    { value: 'claude-sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4', label: 'Sonnet 4' },
    { value: 'claude-haiku-4.5', label: 'Haiku 4.5' },
    { value: 'gpt-5', label: 'GPT-5' },
  ],
  cursor: [
    { value: 'auto', label: 'Auto' },
    { value: 'composer-1', label: 'Composer' },
    { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'opus-4.1', label: 'Opus 4.1' },
    { value: 'grok', label: 'Grok' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  opencode: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1' },
  ],
  v0: [
    { value: 'default', label: 'Default' },
  ],
} as const

// Default models for each agent
const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-5-20250929',
  codex: 'openai/gpt-5',
  copilot: 'claude-sonnet-4.5',
  cursor: 'auto',
  gemini: 'gemini-2.5-pro',
  opencode: 'gpt-5',
  v0: 'default',
} as const

// API key requirements for each agent
const AGENT_API_KEY_REQUIREMENTS: Record<string, Provider[]> = {
  claude: ['anthropic'],
  codex: ['aigateway'], // Uses AI Gateway for OpenAI proxy
  copilot: [], // Uses user's GitHub account token automatically
  cursor: ['cursor'],
  gemini: ['gemini'],
  opencode: [], // Will be determined dynamically based on selected model
  v0: ['v0'], // Uses V0_API_KEY from user-provided API keys
}

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway' | 'v0'

// Helper to determine which API key is needed for opencode based on model
const getOpenCodeRequiredKeys = (model: string): Provider[] => {
  // Check if it's an Anthropic model (claude models)
  if (model.includes('claude') || model.includes('sonnet') || model.includes('opus')) {
    return ['anthropic']
  }
  // Check if it's an OpenAI/GPT model (uses AI Gateway)
  if (model.includes('gpt')) {
    return ['aigateway']
  }
  // Fallback to both if we can't determine
  return ['aigateway', 'anthropic']
}

export function TaskForm({
  onSubmit,
  isSubmitting,
  selectedOwner,
  selectedRepo,
  initialInstallDependencies = false,
  initialMaxDuration = 300,
  initialKeepAlive = false,
  maxSandboxDuration = 300,
}: TaskFormProps) {
  const [prompt, setPrompt] = useAtom(taskPromptAtom)
  const [savedAgent, setSavedAgent] = useAtom(lastSelectedAgentAtom)
  const [selectedAgent, setSelectedAgent] = useState(savedAgent || 'claude')
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODELS.claude)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [repos, setRepos] = useAtom(githubReposAtomFamily(selectedOwner))
  const [, setLoadingRepos] = useState(false)

  // Options state - initialize with server values
  const [installDependencies, setInstallDependenciesState] = useState(initialInstallDependencies)
  const [maxDuration, setMaxDurationState] = useState(initialMaxDuration)
  const [keepAlive, setKeepAliveState] = useState(initialKeepAlive)
  const [showMcpServersDialog, setShowMcpServersDialog] = useState(false)
  
  // New repo creation state
  const [createNewRepo, setCreateNewRepo] = useState(false)
  const [newRepoOwner, setNewRepoOwner] = useState<string>('')
  const [organizations, setOrganizations] = useState<Array<{ login: string; name: string; avatar_url: string }>>([])
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false)
  const session = useAtomValue(sessionAtom)

  // Image upload state
  const [images, setImages] = useState<string[]>([]) // Array of base64-encoded image data URIs
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Connectors state
  const { connectors } = useConnectors()

  // Ref for the textarea to focus it programmatically
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Check if current agent supports images
  const isVisionCapable = selectedAgent === 'gemini' || selectedAgent === 'claude'

  // Wrapper functions to update both state and cookies
  const updateInstallDependencies = (value: boolean) => {
    setInstallDependenciesState(value)
    setInstallDependencies(value)
  }

  const updateMaxDuration = (value: number) => {
    setMaxDurationState(value)
    setMaxDuration(value)
  }

  const updateKeepAlive = (value: boolean) => {
    setKeepAliveState(value)
    setKeepAlive(value)
  }

  // Handle keyboard events in textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // On desktop: Enter submits, Shift+Enter creates new line
      // On mobile: Enter creates new line, must use submit button
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
      if (!isMobile && !e.shiftKey) {
        e.preventDefault()
        if (prompt.trim()) {
          // Find the form and submit it
          const form = e.currentTarget.closest('form')
          if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
          }
        }
      }
      // For all other cases (mobile Enter, desktop Shift+Enter), let default behavior create new line
    }
  }

  // Get URL search params
  const searchParams = useSearchParams()

  // Fetch GitHub username and organizations when createNewRepo is enabled
  useEffect(() => {
    if (!createNewRepo || !session.user) {
      return
    }

    const fetchGitHubData = async () => {
      setIsLoadingOrgs(true)
      try {
        // Fetch GitHub username
        const userResponse = await fetch('/api/github/user')
        if (userResponse.ok) {
          const userData = await userResponse.json()
          setGithubUsername(userData.login)
          // Set default owner to user's username
          if (!newRepoOwner) {
            setNewRepoOwner(userData.login)
          }
        }

        // Fetch organizations
        const orgsResponse = await fetch('/api/github/orgs')
        if (orgsResponse.ok) {
          const orgs = await orgsResponse.json()
          setOrganizations(orgs)
        }
      } catch (error) {
        console.error('Error fetching GitHub data:', error)
      } finally {
        setIsLoadingOrgs(false)
      }
    }

    fetchGitHubData()
  }, [createNewRepo, session.user, newRepoOwner])

  // Load saved agent, model, and options on mount, and focus the prompt input
  useEffect(() => {
    // Check URL params first
    const urlAgent = searchParams?.get('agent')
    const urlModel = searchParams?.get('model')

    if (
      urlAgent &&
      CODING_AGENTS.some((agent) => agent.value === urlAgent && !('isDivider' in agent && agent.isDivider))
    ) {
      setSelectedAgent(urlAgent)
      if (urlModel) {
        const agentModels = AGENT_MODELS[urlAgent as keyof typeof AGENT_MODELS]
        if (agentModels?.some((model) => model.value === urlModel)) {
          setSelectedModel(urlModel)
        }
      }
    } else if (savedAgent) {
      // Fall back to saved agent from Jotai atom
      if (CODING_AGENTS.some((agent) => agent.value === savedAgent && !('isDivider' in agent && agent.isDivider))) {
        setSelectedAgent(savedAgent)
      }
    }

    // Options are now initialized from server props, no need to load from cookies

    // Focus the prompt input when the component mounts
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get saved model atom for current agent
  const savedModelAtom = lastSelectedModelAtomFamily(selectedAgent)
  const savedModel = useAtomValue(savedModelAtom)
  const setSavedModel = useSetAtom(savedModelAtom)

  // Update model when agent changes
  useEffect(() => {
    if (selectedAgent) {
      // Clear selectedModels when switching away from multi-agent
      if (selectedAgent !== 'multi-agent') {
        setSelectedModels([])
      }

      // Clear images when switching to non-vision-capable agent
      if (!isVisionCapable) {
        setImages([])
      }

      // Load saved model for this agent or use default
      const agentModels = AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]
      if (savedModel && agentModels?.some((model) => model.value === savedModel)) {
        setSelectedModel(savedModel)
      } else {
        const defaultModel = DEFAULT_MODELS[selectedAgent as keyof typeof DEFAULT_MODELS]
        if (defaultModel) {
          setSelectedModel(defaultModel)
        }
      }
    }
  }, [selectedAgent, savedModel, isVisionCapable])

  // Fetch repositories when owner changes
  useEffect(() => {
    if (!selectedOwner) {
      setRepos(null)
      return
    }

    const fetchRepos = async () => {
      setLoadingRepos(true)
      try {
        // Check cache first (repos is from the atom)
        if (repos && repos.length > 0) {
          setLoadingRepos(false)
          return
        }

        const response = await fetch(`/api/github/repos?owner=${selectedOwner}`)
        if (response.ok) {
          const reposList = await response.json()
          setRepos(reposList)
        }
      } catch (error) {
        console.error('Error fetching repositories:', error)
      } finally {
        setLoadingRepos(false)
      }
    }

    fetchRepos()
  }, [selectedOwner, repos, setRepos])

  // Image handling functions
  const validateImage = (file: File): string | null => {
    // Check file type
    if (!file.type.startsWith('image/')) {
      return 'File must be an image'
    }

    // Check file size (2MB limit)
    const maxSize = 2 * 1024 * 1024 // 2MB (reduced for single image)
    if (file.size > maxSize) {
      return 'Image size must be less than 2MB'
    }

    return null
  }

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
        } else {
          reject(new Error('Failed to convert image to base64'))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read image file'))
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Validate image count (max 1 image total)
    const currentCount = images.length
    const newCount = currentCount + files.length
    if (newCount > 1) {
      toast.error('Too many images', {
        description: 'Maximum 1 image allowed. Please remove the existing image first.',
      })
      return
    }

    // Process each file
    const newImages: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const error = validateImage(file)
      if (error) {
        toast.error(`Invalid image: ${file.name}`, {
          description: error,
        })
        continue
      }

      try {
        const base64 = await convertToBase64(file)
        newImages.push(base64)
      } catch (error) {
        toast.error(`Failed to process image: ${file.name}`, {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages])
    }
  }

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!isVisionCapable) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    if (!isVisionCapable) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleImageUpload(files)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleImageUpload(files)
    }
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) {
      return
    }

    // Validate that multi-agent mode has at least one model selected
    if (selectedAgent === 'multi-agent' && selectedModels.length === 0) {
      toast.error('Please select at least one model for multi-agent mode')
      return
    }

    // Validate images for vision-capable agents (if images are provided, must be exactly 1)
    if (isVisionCapable && images.length > 0) {
      if (images.length > 1) {
        toast.error('Too many images', {
          description: 'Maximum 1 image allowed.',
        })
        return
      }
    }

      // If owner/repo not selected, let parent handle it (will show sign-in if needed)
      // Don't clear localStorage here - user might need to sign in and come back
      if (!selectedOwner || !selectedRepo) {
        onSubmit({
          prompt: prompt.trim(),
          repoUrl: '',
          selectedAgent,
          selectedModel,
          selectedModels: selectedAgent === 'multi-agent' ? selectedModels : undefined,
          installDependencies,
          maxDuration,
          keepAlive,
          images: isVisionCapable && images.length > 0 ? images : undefined,
          createNewRepo: createNewRepo || undefined,
          newRepoOwner: createNewRepo && newRepoOwner ? newRepoOwner : undefined,
        })
        return
      }

    // Check if API key is required and available for the selected agent and model
    // Skip this check if we don't have repo data (likely not signed in) or if multi-agent mode
    const selectedRepoData = repos?.find((repo) => repo.name === selectedRepo)

    if (selectedRepoData && selectedAgent !== 'multi-agent') {
      try {
        const response = await fetch(`/api/api-keys/check?agent=${selectedAgent}&model=${selectedModel}`)
        const data = await response.json()

        if (!data.hasKey) {
          // Show error message with provider name
          const providerNames: Record<string, string> = {
            anthropic: 'Anthropic',
            openai: 'OpenAI',
            cursor: 'Cursor',
            gemini: 'Gemini',
            aigateway: 'AI Gateway',
          }
          const providerName = providerNames[data.provider] || data.provider

          toast.error(`${providerName} API key required`, {
            description: `Please add your ${providerName} API key in the user menu to use the ${data.agentName} agent with this model.`,
          })
          return
        }
      } catch (error) {
        console.error('Error checking API key:', error)
        // Don't show error toast - might just be not authenticated, let parent handle it
      }
    }

    onSubmit({
      prompt: prompt.trim(),
      repoUrl: selectedRepoData?.clone_url || '',
      selectedAgent,
      selectedModel,
      selectedModels: selectedAgent === 'multi-agent' ? selectedModels : undefined,
      installDependencies,
      maxDuration,
      keepAlive,
      images: isVisionCapable && images.length > 0 ? images : undefined,
      createNewRepo: createNewRepo || undefined,
      newRepoOwner: createNewRepo && newRepoOwner ? newRepoOwner : undefined,
    })
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">Brand the starter</h1>
        <p className="text-lg text-muted-foreground mb-2">
          Multi-agent AI coding platform powered by{' '}
          <a
            href="https://vercel.com/docs/sandbox"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Vercel Sandbox
          </a>{' '}
          and{' '}
          <a
            href="https://vercel.com/docs/ai-gateway"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            AI Gateway
          </a>
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="relative border rounded-2xl shadow-sm overflow-hidden bg-muted/30 cursor-text">
          {/* Prompt Input */}
          <div
            className="relative bg-transparent"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Drag and drop overlay */}
            {isDragging && isVisionCapable && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg">
                <div className="text-center">
                  <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-medium text-primary">Drop images here</p>
                </div>
              </div>
            )}

            {/* Image previews */}
            {isVisionCapable && images.length > 0 && (
              <div className="px-4 pt-4 pb-2 flex gap-2 flex-wrap">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={image}
                      alt={`Upload ${index + 1}`}
                      className="w-16 h-16 object-cover rounded border border-border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveImage(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative flex items-start gap-2">
              <Textarea
                ref={textareaRef}
                id="prompt"
                placeholder={
                  isVisionCapable
                    ? 'Describe what you want the AI agent to do... (Optional: upload 1 image)'
                    : 'Describe what you want the AI agent to do...'
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                disabled={isSubmitting}
                required
                rows={4}
                className="w-full border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 p-4 text-base !bg-transparent"
              />

              {/* Image upload button - only visible for vision-capable agents */}
              {isVisionCapable && (
                <div className="flex-shrink-0 pt-4 pr-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <TooltipProvider delayDuration={1500} skipDelayDuration={1500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full h-8 w-8 p-0"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isSubmitting || images.length >= 1}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Upload image (1 maximum)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </div>

          {/* Agent Selection */}
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              {/* Left side: Agent, Model, and Option Chips */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Agent Selection - Icon only on mobile, minimal width */}
                <Select
                  value={selectedAgent}
                  onValueChange={(value) => {
                    setSelectedAgent(value)
                    // Save to Jotai atom immediately
                    setSavedAgent(value)
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-auto sm:min-w-[120px] border-0 bg-transparent shadow-none focus:ring-0 h-8 shrink-0">
                    <SelectValue placeholder="Agent">
                      {selectedAgent &&
                        (() => {
                          const agent = CODING_AGENTS.find((a) => a.value === selectedAgent)
                          return agent ? (
                            <div className="flex items-center gap-2">
                              <agent.icon className="w-4 h-4" />
                              <span className="hidden sm:inline">{agent.label}</span>
                            </div>
                          ) : null
                        })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CODING_AGENTS.map((agent) => {
                      if ('isDivider' in agent && agent.isDivider) {
                        return <div key={agent.value} className="h-px bg-border my-1" />
                      }
                      return (
                        <SelectItem key={agent.value} value={agent.value}>
                          <div className="flex items-center gap-2">
                            <agent.icon className="w-4 h-4" />
                            <span>{agent.label}</span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                {/* Model Selection - Fills available width on mobile */}
                {selectedAgent === 'multi-agent' ? (
                  <Select value="multi-select" onValueChange={() => {}} disabled={isSubmitting}>
                    <SelectTrigger className="flex-1 sm:flex-none sm:w-auto sm:min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8 min-w-0">
                      <SelectValue>
                        {selectedModels.length === 0 ? 'Select models' : `${selectedModels.length} Selected`}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CODING_AGENTS.filter((agent) => agent.value !== 'multi-agent').map((agent) => (
                        <div key={agent.value}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{agent.label}</div>
                          {AGENT_MODELS[agent.value as keyof typeof AGENT_MODELS]?.map((model) => {
                            const fullValue = `${agent.value}:${model.value}`
                            const isSelected = selectedModels.includes(fullValue)
                            return (
                              <div
                                key={fullValue}
                                className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                onClick={(e) => {
                                  e.preventDefault()
                                  setSelectedModels((prev) =>
                                    isSelected ? prev.filter((m) => m !== fullValue) : [...prev, fullValue],
                                  )
                                }}
                              >
                                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                  {isSelected && (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  )}
                                </span>
                                {model.label}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={selectedModel}
                    onValueChange={(value) => {
                      setSelectedModel(value)
                      // Save to Jotai atom immediately
                      setSavedModel(value)
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="flex-1 sm:flex-none sm:w-auto sm:min-w-[140px] border-0 bg-transparent shadow-none focus:ring-0 h-8 min-w-0">
                      <SelectValue placeholder="Model" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]?.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      )) || []}
                    </SelectContent>
                  </Select>
                )}

                {/* Option Chips - Only visible on desktop */}
                {(!installDependencies || maxDuration !== maxSandboxDuration || keepAlive) && (
                  <div className="hidden sm:flex items-center gap-2 flex-wrap">
                    {!installDependencies && (
                      <Badge variant="secondary" className="text-xs h-6 px-2 gap-1 bg-transparent border-0">
                        Skip Install
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-3 w-3 p-0 hover:bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateInstallDependencies(true)
                          }}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </Badge>
                    )}
                    {maxDuration !== maxSandboxDuration && (
                      <Badge variant="secondary" className="text-xs h-6 px-2 gap-1 bg-transparent border-0">
                        {maxDuration}m
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-3 w-3 p-0 hover:bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateMaxDuration(maxSandboxDuration)
                          }}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </Badge>
                    )}
                    {keepAlive && (
                      <Badge variant="secondary" className="text-xs h-6 px-2 gap-1 bg-transparent border-0">
                        Keep Alive
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-3 w-3 p-0 hover:bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateKeepAlive(false)
                          }}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Right side: Action Icons and Submit Button */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Buttons */}
                <div className="flex items-center gap-2">
                  <TooltipProvider delayDuration={1500} skipDelayDuration={1500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full h-8 w-8 p-0 relative"
                          onClick={() => setShowMcpServersDialog(true)}
                        >
                          <Cable className="h-4 w-4" />
                          {connectors.filter((c) => c.status === 'connected').length > 0 && (
                            <Badge
                              variant="secondary"
                              className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px] rounded-full"
                            >
                              {connectors.filter((c) => c.status === 'connected').length}
                            </Badge>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>MCP Servers</p>
                      </TooltipContent>
                    </Tooltip>

                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="rounded-full h-8 w-8 p-0 relative"
                            >
                              <Settings className="h-4 w-4" />
                              {(() => {
                                const customOptionsCount = [
                                  !installDependencies,
                                  maxDuration !== maxSandboxDuration,
                                  keepAlive,
                                ].filter(Boolean).length
                                return customOptionsCount > 0 ? (
                                  <Badge
                                    variant="secondary"
                                    className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px] rounded-full sm:hidden"
                                  >
                                    {customOptionsCount}
                                  </Badge>
                                ) : null
                              })()}
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Task Options</p>
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent className="w-72" align="end">
                        <DropdownMenuLabel>Task Options</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <div className="p-2 space-y-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="install-deps"
                              checked={installDependencies}
                              onCheckedChange={(checked) => updateInstallDependencies(checked === true)}
                            />
                            <Label
                              htmlFor="install-deps"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              Install Dependencies?
                            </Label>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="max-duration" className="text-sm font-medium">
                              Maximum Duration
                            </Label>
                            <Select
                              value={maxDuration.toString()}
                              onValueChange={(value) => updateMaxDuration(parseInt(value))}
                            >
                              <SelectTrigger id="max-duration" className="w-full h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5 minutes</SelectItem>
                                <SelectItem value="10">10 minutes</SelectItem>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="45">45 minutes</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="120">2 hours</SelectItem>
                                <SelectItem value="180">3 hours</SelectItem>
                                <SelectItem value="240">4 hours</SelectItem>
                                <SelectItem value="300">5 hours</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="keep-alive"
                                checked={keepAlive}
                                onCheckedChange={(checked) => updateKeepAlive(checked === true)}
                              />
                              <Label
                                htmlFor="keep-alive"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                Keep Alive ({maxSandboxDuration}m max)
                              </Label>
                            </div>
                            <p className="text-xs text-muted-foreground pl-6">Keep sandbox running after completion.</p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="create-new-repo"
                                checked={createNewRepo}
                                onCheckedChange={(checked) => {
                                  setCreateNewRepo(checked === true)
                                  if (checked === false) {
                                    setNewRepoOwner('')
                                  }
                                }}
                              />
                              <Label
                                htmlFor="create-new-repo"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                Create new repository instead of branch
                              </Label>
                            </div>
                            <p className="text-xs text-muted-foreground pl-6">
                              Push code to a new private repository instead of creating a branch.
                            </p>
                            {createNewRepo && (
                              <div className="space-y-2 pl-6 pt-2">
                                <Label htmlFor="new-repo-owner" className="text-xs font-medium">
                                  Repository Owner
                                </Label>
                                <Select
                                  value={newRepoOwner}
                                  onValueChange={setNewRepoOwner}
                                  disabled={isLoadingOrgs}
                                >
                                  <SelectTrigger id="new-repo-owner" className="w-full h-8 text-xs">
                                    <SelectValue placeholder={isLoadingOrgs ? 'Loading...' : 'Select owner'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {githubUsername && (
                                      <SelectItem value={githubUsername}>
                                        <div className="flex items-center gap-2">
                                          <img
                                            src={session.user?.avatar || ''}
                                            alt={githubUsername}
                                            className="w-4 h-4 rounded-full"
                                          />
                                          <span>{githubUsername}</span>
                                        </div>
                                      </SelectItem>
                                    )}
                                    {organizations.map((org) => (
                                      <SelectItem key={org.login} value={org.login}>
                                        <div className="flex items-center gap-2">
                                          <img src={org.avatar_url} alt={org.login} className="w-4 h-4 rounded-full" />
                                          <span>{org.login}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TooltipProvider>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !prompt.trim()}
                    size="sm"
                    className="rounded-full h-8 w-8 p-0"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Agent Info */}
        {selectedAgent === 'multi-agent' && selectedModels.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            This will create {selectedModels.length} separate task{selectedModels.length > 1 ? 's' : ''} (one for each
            selected model)
          </div>
        )}
      </form>

      <ConnectorDialog open={showMcpServersDialog} onOpenChange={setShowMcpServersDialog} />
    </div>
  )
}
