import { Sandbox } from '@vercel/sandbox'
import { AgentExecutionResult } from '../types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { createClient, type ChatDetail } from 'v0-sdk'

/**
 * Execute v0 Platform API to generate code
 * Uses v0 Platform API to create projects and generate code files
 */
export async function executeV0InSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  taskId?: string,
  agentMessageId?: string,
  images?: string[], // Array of base64-encoded image data URIs
): Promise<AgentExecutionResult> {
  if (logger) {
    await logger.info('Starting v0 Platform API execution')
  }

  // Check for v0 API key (from process.env, which is set from user's API keys or system env)
  const v0ApiKey = process.env.V0_API_KEY
  if (!v0ApiKey || v0ApiKey.trim() === '') {
    const errorMsg = 'V0 API key not found. Please add your V0 API key in the user menu (API Keys) to use the v0 agent.'
    if (logger) {
      await logger.error(errorMsg)
    }
    console.error('[v0 agent] V0_API_KEY is missing or empty')
    return {
      success: false,
      error: errorMsg,
      cliName: 'v0',
      changesDetected: false,
    }
  }

  if (logger) {
    await logger.info('V0 API key configured')
  }

  console.log('[v0 agent] V0_API_KEY found, length:', v0ApiKey.length)

  try {
    // Create v0 client with validated API key
    const v0 = createClient({
      apiKey: v0ApiKey.trim(),
    })

    // Create a project for this task
    let projectId: string | undefined
    let projectUrl: string | null = null

    if (logger) {
      await logger.info('Creating v0 project...')
    }

    console.log('[v0 agent] Creating project...')
    let project
    try {
      project = await v0.projects.create({
        name: `Task ${taskId || 'unknown'} - ${new Date().toISOString()}`,
      })
      console.log('[v0 agent] Project created:', project.id)
    } catch (error) {
      console.error('[v0 agent] Error creating project:', error)
      if (error instanceof Error && error.message.includes('API key')) {
        const errorMsg = `V0 API key error: ${error.message}. Please verify V0_API_KEY is set correctly in .env.local`
        if (logger) {
          await logger.error(errorMsg)
        }
        return {
          success: false,
          error: errorMsg,
          cliName: 'v0',
          changesDetected: false,
        }
      }
      throw error
    }

    projectId = project.id
    projectUrl = project.webUrl || null

    if (logger) {
      await logger.info(`Project created: ${projectId}`)
      if (projectUrl) {
        await logger.info(`Project URL: ${projectUrl}`)
      }
    }

    // Build prompt for v0
    let prompt = instruction

    // If images are provided, mention them in the prompt
    if (images && images.length > 0) {
      prompt = `${instruction}\n\n[${images.length} image(s) attached for reference]`
      if (logger) {
        await logger.info(`Including ${images.length} image(s) in prompt`)
      }
    }

    // Create a chat with v0 to generate the code
    if (logger) {
      await logger.info('Creating v0 chat to generate code...')
    }

    console.log('[v0 agent] Creating chat with prompt length:', prompt.length)
    let chatResponse
    try {
      chatResponse = await v0.chats.create({
        message: prompt,
        projectId: projectId,
      })
      console.log('[v0 agent] Chat created successfully')
    } catch (error) {
      console.error('[v0 agent] Error creating chat:', error)
      if (error instanceof Error && error.message.includes('API key')) {
        const errorMsg = `V0 API key error: ${error.message}. Please verify V0_API_KEY is set correctly in .env.local`
        if (logger) {
          await logger.error(errorMsg)
        }
        return {
          success: false,
          error: errorMsg,
          cliName: 'v0',
          changesDetected: false,
        }
      }
      throw error
    }

    // Handle streaming response (if returned)
    let chat: ChatDetail
    if (chatResponse instanceof ReadableStream) {
      // If it's a stream, we need to wait for it to complete
      // For now, throw an error as streaming is not fully implemented
      const errorMsg = 'Streaming response not yet supported. Please use non-streaming mode.'
      if (logger) {
        await logger.error(errorMsg)
      }
      return {
        success: false,
        error: errorMsg,
        cliName: 'v0',
        changesDetected: false,
      }
    } else {
      chat = chatResponse
    }

    if (logger) {
      await logger.info(`Chat created: ${chat.id}`)
    }

    // Wait for files to be generated (v0 API may process asynchronously)
    let files: Array<{ name: string; content: string }> = []
    if (chat.latestVersion?.files) {
      files = chat.latestVersion.files.map((f) => ({ name: f.name, content: f.content }))
    } else if (chat.files && Array.isArray(chat.files)) {
      files = chat.files
        .filter((f) => f.source)
        .map((f) => ({ name: f.source || 'unknown', content: f.source || '' }))
    }

    let attempts = 0
    const maxAttempts = 20 // Wait up to 2 minutes (6s * 20)

    while (files.length === 0 && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 6000)) // 6 seconds

      try {
        const updatedChat = await v0.chats.getById({ chatId: chat.id })
        if (updatedChat.latestVersion?.files) {
          files = updatedChat.latestVersion.files.map((f) => ({ name: f.name, content: f.content }))
        } else if (updatedChat.files && Array.isArray(updatedChat.files)) {
          files = updatedChat.files
            .filter((f) => f.source)
            .map((f) => ({ name: f.source || 'unknown', content: f.source || '' }))
        }

        if (logger && attempts % 3 === 0) {
          await logger.info(`Waiting for files to be generated... (attempt ${attempts + 1}/${maxAttempts})`)
        }
      } catch (error) {
        if (logger) {
          await logger.error(`Error fetching chat: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      attempts++
    }

    if (files.length > 0) {
      if (logger) {
        await logger.info(`Generated ${files.length} file(s)`)
      }

      // Write files to the sandbox
      for (const file of files) {
        try {
          // Create directory structure if needed
          const filePath = file.name
          const dirPath = filePath.substring(0, filePath.lastIndexOf('/'))
          if (dirPath) {
            await sandbox.runCommand({
              cmd: 'mkdir',
              args: ['-p', dirPath],
            })
          }

          // Write file content
          await sandbox.runCommand({
            cmd: 'sh',
            args: ['-c', `cat > "${filePath}" << 'EOF'\n${file.content}\nEOF`],
          })

          if (logger) {
            await logger.info(`File written: ${filePath}`)
          }
        } catch (error) {
          if (logger) {
            await logger.error(`Failed to write file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
      }

      if (logger) {
        await logger.success('Code generation completed')
      }

      return {
        success: true,
        cliName: 'v0',
        changesDetected: true,
        agentResponse: `Generated ${files.length} file(s) using v0 Platform API. View project: ${projectUrl || 'N/A'}`,
        v0ProjectUrl: projectUrl || undefined,
      }
    } else {
      if (logger) {
        await logger.info('No files generated after waiting')
      }

      return {
        success: true,
        cliName: 'v0',
        changesDetected: false,
        agentResponse: 'Chat created but no files generated yet. View project: ' + (projectUrl || 'N/A'),
        v0ProjectUrl: projectUrl || undefined,
      }
    }
  } catch (error) {
    const errorMsg = `v0 execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    if (logger) {
      await logger.error(errorMsg)
    }
    return {
      success: false,
      error: errorMsg,
      cliName: 'v0',
      changesDetected: false,
    }
  }
}

