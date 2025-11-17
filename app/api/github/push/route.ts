import { NextRequest, NextResponse } from 'next/server'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserGitHubToken } from '@/lib/github/user-token'

const execFileAsync = promisify(execFile)
const WORKSPACE_ROOT = process.cwd()

const EXCLUDED_NAMES = new Set([
  '.git',
  'node_modules',
  '.next',
  '.vercel',
  '.turbo',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'build',
  'out',
  'tmp',
  'temp',
  '__generated__',
])

const EXCLUDED_PREFIXES = ['.env', '.DS_Store']

function shouldExclude(name: string) {
  if (EXCLUDED_NAMES.has(name)) return true
  return EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix))
}

async function copyWorkspace(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true })
  const entries = await fs.readdir(source, { withFileTypes: true })

  for (const entry of entries) {
    if (shouldExclude(entry.name)) continue

    const srcPath = path.join(source, entry.name)
    const destPath = path.join(destination, entry.name)

    if (entry.isSymbolicLink()) {
      continue
    }
    if (entry.isDirectory()) {
      await copyWorkspace(srcPath, destPath)
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

async function runGit(args: string[], cwd: string) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  return execFileAsync('git', args, { cwd, env, maxBuffer: 1024 * 1024 * 10 })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const owner = body?.owner
  const repo = body?.repo
  const branch = typeof body?.branch === 'string' && body.branch.trim().length > 0 ? body.branch.trim() : 'main'
  const commitMessage =
    typeof body?.commitMessage === 'string' && body.commitMessage.trim().length > 0
      ? body.commitMessage.trim()
      : 'Sync from Shopify Data Generator'

  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 })
  }

  const githubToken = await getUserGitHubToken()
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub account not connected' }, { status: 401 })
  }

  let tempDir: string | undefined
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-push-'))
    const projectDir = path.join(tempDir, 'repo')

    const remoteUrl = `https://${githubToken}:x-oauth-basic@github.com/${owner}/${repo}.git`

    let cloned = false
    try {
      await runGit(['clone', remoteUrl, projectDir], tempDir)
      cloned = true
    } catch (error) {
      // Initialize new repository if clone fails (likely empty repo)
      await fs.mkdir(projectDir, { recursive: true })
      await runGit(['init'], projectDir)
      await runGit(['checkout', '-b', branch], projectDir)
      await runGit(['remote', 'add', 'origin', remoteUrl], projectDir)
    }

    if (cloned) {
      await runGit(['checkout', branch], projectDir).catch(async () => {
        await runGit(['checkout', '-b', branch], projectDir)
      })
    }

    // Remove existing files (except .git)
    const existingEntries = await fs.readdir(projectDir)
    await Promise.all(
      existingEntries.map(async (entry) => {
        if (entry === '.git') return
        await fs.rm(path.join(projectDir, entry), { recursive: true, force: true })
      }),
    )

    await copyWorkspace(WORKSPACE_ROOT, projectDir)

    const authorName = session.user.name || session.user.username || 'Shopify Data Generator'
    const authorEmail =
      session.user.email || `${session.user.username || 'shopify-data-generator'}@users.noreply.github.com`

    await runGit(['config', 'user.name', authorName], projectDir)
    await runGit(['config', 'user.email', authorEmail], projectDir)

    await runGit(['add', '--all'], projectDir)
    const { stdout: statusOutput } = await runGit(['status', '--porcelain'], projectDir)

    if (!statusOutput.trim()) {
      return NextResponse.json({ success: true, noChanges: true, branch })
    }

    await runGit(['commit', '-m', commitMessage], projectDir)
    await runGit(['push', '-u', 'origin', branch], projectDir)

    const { stdout: commitShaOutput } = await runGit(['rev-parse', 'HEAD'], projectDir)
    const commitSha = commitShaOutput.trim()

    return NextResponse.json({
      success: true,
      branch,
      commit: commitSha,
      message: 'Changes pushed to GitHub',
    })
  } catch (error) {
    console.error('GitHub push failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to push changes to GitHub'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

