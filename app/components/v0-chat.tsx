'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { githubSelectionAtom } from '@/lib/atoms/github-selection';
import { githubConnectionAtom } from '@/lib/atoms/github-connection';

interface GeneratedFile {
  name: string;
  content: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  files?: GeneratedFile[];
}

export default function V0Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatUrl, setChatUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [existingChatInput, setExistingChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({
    status: 'idle',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const githubSelection = useAtomValue(githubSelectionAtom);
  const setGithubSelection = useSetAtom(githubSelectionAtom);
  const githubConnection = useAtomValue(githubConnectionAtom);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  const triggerPushToGitHub = useCallback(
    async (reason: string) => {
      if (!githubSelection?.owner || !githubSelection.repo) {
        setPushState((prev) =>
          prev.status === 'error' && prev.message?.includes('Select a GitHub repository')
            ? prev
            : {
                status: 'error',
                message: 'Select a GitHub repository in the header to sync changes automatically.',
              },
        );
        return;
      }

      const branch = githubSelection.branch?.trim() || 'main';
      const repoLabel = `${githubSelection.owner}/${githubSelection.repo}`;

      setPushState({
        status: 'loading',
        message: `Pushing latest changes to ${repoLabel} (${branch})…`,
      });

      try {
        const response = await fetch('/api/github/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            owner: githubSelection.owner,
            repo: githubSelection.repo,
            branch,
            commitMessage: `Commerce Starter update: ${reason}`,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || 'Failed to push changes to GitHub');
        }

        if (data?.noChanges) {
          setPushState({
            status: 'success',
            message: `${repoLabel} is already up to date.`,
          });
        } else {
          const shortCommit = typeof data?.commit === 'string' ? data.commit.slice(0, 7) : undefined;
          setPushState({
            status: 'success',
            message: shortCommit
              ? `Pushed to ${repoLabel}@${branch} (commit ${shortCommit}).`
              : `Pushed to ${repoLabel}@${branch}.`,
          });
        }
      } catch (pushError) {
        setPushState({
          status: 'error',
          message:
            pushError instanceof Error ? pushError.message : 'Failed to push changes to GitHub. Please try again.',
        });
      }
    },
    [githubSelection],
  );

  const createNewRepositoryAndPush = useCallback(async () => {
    if (!githubConnection.connected) {
      setPushState({
        status: 'error',
        message: 'Connect your GitHub account in the header before creating a new repository.',
      });
      return;
    }

    const defaultOwner = githubSelection?.owner || githubConnection.username || '';
    const ownerPrompt =
      defaultOwner ||
      (window.prompt('Enter the GitHub owner (username or organization) for the new repository:', '') || '');
    const owner = ownerPrompt.trim();

    if (!owner) {
      setPushState({
        status: 'error',
        message: 'Repository owner is required.',
      });
      return;
    }

    const repoNameInput = window.prompt('Enter a name for the new GitHub repository:', '');
    if (!repoNameInput) {
      return;
    }
    const repoName = repoNameInput.trim();

    if (!/^[a-zA-Z0-9._-]+$/.test(repoName)) {
      setPushState({
        status: 'error',
        message: 'Repository name can only contain letters, numbers, periods, hyphens, and underscores.',
      });
      return;
    }

    setPushState({
      status: 'loading',
      message: `Creating GitHub repository ${owner}/${repoName}…`,
    });

    try {
      const response = await fetch('/api/github/repos/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: repoName,
          owner,
          private: false,
          description: 'Commerce Starter project generated via v0 chat',
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create GitHub repository');
      }

      setGithubSelection({
        owner,
        repo: data?.name || repoName,
        branch: 'main',
      });

      setPushState({
        status: 'loading',
        message: `Repository ${owner}/${repoName} created. Pushing current workspace…`,
      });

      await triggerPushToGitHub('Initial push to new GitHub repository');
    } catch (error) {
      setPushState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to create GitHub repository.',
      });
    }
  }, [githubConnection, githubSelection, setGithubSelection, triggerPushToGitHub]);

  const selectExistingRepository = useCallback(() => {
    if (!githubConnection.connected) {
      setPushState({
        status: 'error',
        message: 'Connect your GitHub account in the header before selecting a repository.',
      });
      return;
    }

    const defaultFullName = githubSelection?.owner && githubSelection.repo ? `${githubSelection.owner}/${githubSelection.repo}` : '';
    const ownerRepoInput =
      window.prompt('Enter an existing GitHub repository (owner/repo):', defaultFullName) || '';
    const ownerRepo = ownerRepoInput.trim();

    if (!ownerRepo) {
      return;
    }

    const [owner, repo] = ownerRepo.split('/');

    if (!owner || !repo) {
      setPushState({
        status: 'error',
        message: 'Please provide the repository in the format owner/repo.',
      });
      return;
    }

    const branchInput = window.prompt('Repository branch to sync (default: main):', githubSelection?.branch || 'main') || '';
    const branch = branchInput.trim() || 'main';

    setGithubSelection({
      owner: owner.trim(),
      repo: repo.trim(),
      branch,
    });

    setPushState({
      status: 'success',
      message: `Using ${owner.trim()}/${repo.trim()} @ ${branch} for future pushes.`,
    });
  }, [githubConnection, githubSelection, setGithubSelection]);


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const hasActiveChat = useMemo(() => Boolean(chatId), [chatId]);

  const extractChatId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || null;
    } catch {
      return trimmed;
    }
  };

  const resetConversation = (options?: { keepMode?: boolean }) => {
    setMessages([]);
    setChatId(null);
    setChatUrl(null);
    setError(null);
    setInput('');

    if (!options?.keepMode) {
      setMode('new');
    }
  };

  const handleModeChange = (nextMode: 'new' | 'existing') => {
    setMode(nextMode);
    resetConversation({ keepMode: true });
    if (nextMode === 'existing') {
      setExistingChatInput('');
    }
  };

  const handleLoadExisting = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedChatId = extractChatId(existingChatInput);

    if (!parsedChatId) {
      setError('Please enter a valid chat URL or ID.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v0-chat?chatId=${encodeURIComponent(parsedChatId)}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to load existing chat');
      }

      const data = await response.json();

      const normalizedMessages: Message[] =
        (data.messages as Array<{ id: string; role: string; content: string; createdAt: string }> | undefined)
          ?.filter((msg) => msg.role === 'user' || msg.role === 'assistant')
          .sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )
          .map((msg) => ({
            id: msg.id,
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          })) ?? [];

      setMessages(normalizedMessages);
      setChatId(data.chatId);
      setChatUrl(data.webUrl ?? null);
      setExistingChatInput('');
      setMode('existing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load existing chat');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (mode === 'existing' && !chatId) {
      setError('Load an existing chat before sending messages.');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      let response;
      
      if (!chatId) {
        // Create a new chat
        response = await fetch('/api/v0-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create',
            message: userMessage.content,
            system: 'You are an expert coding assistant. Help users with their questions about code, React, Next.js, and web development.',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create chat');
        }

        const createData = await response.json();
        setChatId(createData.chatId);
        setChatUrl(createData.webUrl ?? null);

        // Log files to console
        if (createData.files && createData.files.length > 0) {
          console.log('Generated files:', createData.files);
          createData.files.forEach((file: GeneratedFile) => {
            console.log(`File: ${file.name}`, file.content);
          });
        }

        // Add assistant's initial response if available
        if (createData.response) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: createData.response,
            timestamp: new Date(),
            files: createData.files || [],
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }

        await triggerPushToGitHub('Initial v0 conversation output');
      } else {
        // Send message to existing chat
        response = await fetch('/api/v0-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'send',
            chatId,
            message: userMessage.content,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send message');
        }

        const sendData = await response.json();
        
        // Log files to console
        if (sendData.files && sendData.files.length > 0) {
          console.log('Generated files:', sendData.files);
          sendData.files.forEach((file: GeneratedFile) => {
            console.log(`File: ${file.name}`, file.content);
          });
        }
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: sendData.response || 'Message sent successfully',
          timestamp: new Date(),
          files: sendData.files || [],
        };
        setMessages((prev) => [...prev, assistantMessage]);

        await triggerPushToGitHub('Updated v0 conversation output');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Remove the user message if there was an error
      setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    resetConversation({ keepMode: true });
  };

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Start a new brand project or work on an existing one.
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Powered by the v0 Platform API.
          </p>
          {chatUrl && (
            <a
              href={chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Open conversation in v0 ↗
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('new')}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              mode === 'new'
                ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            Start new project
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('existing')}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              mode === 'existing'
                ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            Work on existing project
          </button>
          {hasActiveChat && (
            <button
              onClick={handleReset}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Reset conversation
            </button>
          )}
        </div>
      </div>

      {mode === 'existing' && !hasActiveChat && (
        <div className="border-b border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <form onSubmit={handleLoadExisting} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Paste a v0 chat URL or ID
              </label>
              <input
                type="text"
                value={existingChatInput}
                onChange={(event) => setExistingChatInput(event.target.value)}
                placeholder="https://v0.app/chat/your-chat-id"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !existingChatInput.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isLoading ? 'Loading…' : 'Fetch conversation'}
            </button>
          </form>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              {mode === 'existing' ? (
                <>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Fetch an existing v0 conversation to continue where you left off.
                  </p>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
                    Paste a chat URL or ID above to load previous messages.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Start a conversation with v0 for your next brand project.
                  </p>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
                    Ask anything about branding, design, or development to kick things off.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                
                {/* Display generated files */}
                {message.files && message.files.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-zinc-300 pt-3 dark:border-zinc-600">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Generated Files ({message.files.length}):
                    </p>
                    {message.files.map((file, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                            {file.name}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {file.content.length} chars
                          </span>
                        </div>
                        <pre className="max-h-40 overflow-y-auto rounded bg-zinc-50 p-2 text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                          <code>{file.content}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
                
                <p
                  className={`mt-1 text-xs ${
                    message.role === 'user'
                      ? 'text-zinc-400 dark:text-zinc-600'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
              <div className="flex space-x-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {pushState.status !== 'idle' && pushState.message && (
        <div
          className={`mx-4 mt-2 rounded-md border p-3 text-sm ${
            pushState.status === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
              : pushState.status === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
              : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {pushState.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{pushState.message}</span>
          </div>
        </div>
      )}

      {githubConnection.connected && (
        <div className="mx-4 mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={createNewRepositoryAndPush}
            className="rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Create new GitHub repo &amp; push
          </button>
          <button
            type="button"
            onClick={selectExistingRepository}
            className="rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Use existing GitHub repo
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Generate a fresh repository or link an existing one to sync this workspace automatically.
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mx-4 mb-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={
              isLoading ||
              (mode === 'existing' && !hasActiveChat)
            }
            className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-black focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={
              isLoading ||
              !input.trim() ||
              (mode === 'existing' && !hasActiveChat)
            }
            className="rounded-md bg-zinc-900 px-6 py-2 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

