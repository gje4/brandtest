import { NextRequest, NextResponse } from 'next/server'
import { createClient } from 'v0-sdk'

type ChatDetail = {
  id: string
  webUrl: string
  apiUrl: string
  shareable: boolean
  privacy: string
  latestVersion?: {
    content?: string
    files?: Array<{
      name: string
      content: string
    }>
  }
  messages?: Array<{
    id: string
    role: string
    content: string
    createdAt: string
  }>
}

function getV0Client() {
  const apiKey = process.env.V0_API_KEY
  if (!apiKey) {
    throw new Error('V0_API_KEY not configured. Please add it to your .env.local file.')
  }
  return createClient({ apiKey })
}

async function fetchChatDetail(
  chatId: string,
  options?: { includeMessages?: boolean },
): Promise<ChatDetail> {
  const client = getV0Client()
  const chat = await client.chats.getById({ chatId })
  const detail: ChatDetail = {
    id: chat.id,
    webUrl: chat.webUrl,
    apiUrl: chat.apiUrl,
    shareable: chat.shareable,
    privacy: chat.privacy,
    latestVersion: chat.latestVersion
      ? {
          content: chat.latestVersion.content,
          files: chat.latestVersion.files?.map((file) => ({
            name: file.name,
            content: file.content,
          })),
        }
      : undefined,
  }

  if (options?.includeMessages) {
    const messagesResponse = await client.chats.findMessages({ chatId, limit: 50 })
    detail.messages =
      messagesResponse.data?.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })) ?? []
  }

  return detail
}

export async function GET(request: NextRequest) {
  try {
    const chatId = request.nextUrl.searchParams.get('chatId')
    if (!chatId) {
      return NextResponse.json({ error: 'chatId query parameter is required' }, { status: 400 })
    }

    const chatDetail = await fetchChatDetail(chatId, { includeMessages: true })

    return NextResponse.json({
      chatId: chatDetail.id,
      webUrl: chatDetail.webUrl,
      apiUrl: chatDetail.apiUrl,
      shareable: chatDetail.shareable,
      privacy: chatDetail.privacy,
      messages: chatDetail.messages ?? [],
    })
  } catch (error) {
    console.error('V0 Chat GET Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch chat details'
    const status = message.includes('V0_API_KEY') ? 500 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, message, chatId, system } = body

    const v0Client = getV0Client()

    if (action === 'create') {
      const chat = await v0Client.chats.create({
        message: message || 'Hello!',
        system: system || 'You are a helpful coding assistant.',
        responseMode: 'sync',
      })

      if (chat instanceof ReadableStream) {
        return NextResponse.json(
          { error: 'Streaming response not supported. Please use standard chat creation.' },
          { status: 400 },
        )
      }

      const createdChat = chat as ChatDetail
      const refreshedChat = await fetchChatDetail(createdChat.id)

      return NextResponse.json({
        chatId: refreshedChat.id,
        webUrl: refreshedChat.webUrl,
        apiUrl: refreshedChat.apiUrl,
        shareable: refreshedChat.shareable,
        privacy: refreshedChat.privacy,
        message: 'Chat created successfully',
        response: refreshedChat.latestVersion?.content || 'Chat created successfully',
        files: refreshedChat.latestVersion?.files || [],
      })
    }

    if (action === 'send') {
      if (!chatId || !message) {
        return NextResponse.json(
          { error: 'chatId and message are required for send action' },
          { status: 400 },
        )
      }

      const response = await v0Client.chats.sendMessage({
        chatId,
        message,
        responseMode: 'sync',
      })

      if (response instanceof ReadableStream) {
        return NextResponse.json(
          { error: 'Streaming response not supported. Please use standard message sending.' },
          { status: 400 },
        )
      }

      const chatDetail = response as ChatDetail

      return NextResponse.json({
        success: true,
        response: chatDetail.latestVersion?.content || 'Message sent successfully',
        files: chatDetail.latestVersion?.files || [],
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use "create" or "send"' }, { status: 400 })
  } catch (error) {
    console.error('V0 Chat API Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to process chat request'
    const status = message.includes('V0_API_KEY') ? 500 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

