import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { Octokit } from '@octokit/rest'

interface RepoTemplate {
  id: string
  name: string
  description: string
  cloneUrl?: string
  image?: string
}

// Helper function to recursively copy files from a directory
async function copyFilesRecursively(
  octokit: Octokit,
  sourceOwner: string,
  sourceRepoName: string,
  sourcePath: string,
  repoOwner: string,
  repoName: string,
  basePath: string,
) {
  try {
    const { data: contents } = await octokit.repos.getContent({
      owner: sourceOwner,
      repo: sourceRepoName,
      path: sourcePath,
    })

    if (!Array.isArray(contents)) {
      return
    }

    for (const item of contents) {
      if (item.type === 'file' && item.download_url) {
        try {
          // Download file content
          const response = await fetch(item.download_url)
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
          }
          const content = await response.text()

          // Calculate relative path by removing the base path prefix
          const relativePath = basePath
            ? item.path.startsWith(basePath + '/')
              ? item.path.substring(basePath.length + 1)
              : item.name
            : item.path

          // Create file in new repository
          await octokit.repos.createOrUpdateFileContents({
            owner: repoOwner,
            repo: repoName,
            path: relativePath,
            message: `Add ${relativePath} from template`,
            content: Buffer.from(content).toString('base64'),
          })
        } catch (error) {
          console.error('Error copying file:', error)
          // Continue with other files even if one fails
        }
      } else if (item.type === 'dir') {
        // Recursively process directories
        await copyFilesRecursively(octokit, sourceOwner, sourceRepoName, item.path, repoOwner, repoName, basePath)
      }
    }
  } catch (error) {
    console.error('Error processing directory:', error)
    // Continue even if one directory fails
  }
}

// Helper function to copy files from template repository
async function populateRepoFromTemplate(octokit: Octokit, repoOwner: string, repoName: string, template: RepoTemplate) {
  if (!template.cloneUrl) {
    return
  }

  // Parse clone URL to get owner and repo name
  const cloneMatch = template.cloneUrl.match(/github\.com\/([\w-]+)\/([\w-]+?)(?:\.git)?$/)
  if (!cloneMatch) {
    throw new Error('Invalid clone URL')
  }

  const [, sourceOwner, sourceRepoName] = cloneMatch

  try {
    // Get all files from the root of the template repository
    await copyFilesRecursively(
      octokit,
      sourceOwner,
      sourceRepoName,
      '', // Root path
      repoOwner,
      repoName,
      '', // Root path
    )
  } catch (error) {
    console.error('Error populating repository from template:', error)
    throw error
  }
}

export async function POST(request: Request) {
  try {
    // Get the authenticated user's session
    const session = await getServerSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's GitHub token
    const token = await getUserGitHubToken()

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token not found. Please reconnect your GitHub account.' },
        { status: 401 },
      )
    }

    // Parse request body
    const { name, description, private: isPrivate, owner, template } = await request.json()

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Repository name is required' }, { status: 400 })
    }

    // Validate repository name format
    const repoNamePattern = /^[a-zA-Z0-9._-]+$/
    if (!repoNamePattern.test(name)) {
      return NextResponse.json(
        { error: 'Repository name can only contain alphanumeric characters, periods, hyphens, and underscores' },
        { status: 400 },
      )
    }

    // Initialize Octokit with user's token
    const octokit = new Octokit({ auth: token })

    try {
      // Check if owner is an org or the user's personal account
      let repo

      if (owner) {
        // First, check if the owner is the user's personal account
        const { data: user } = await octokit.users.getAuthenticated()

        if (user.login === owner) {
          // Create in user's personal account
          repo = await octokit.repos.createForAuthenticatedUser({
            name,
            description: description || undefined,
            private: isPrivate || false,
            auto_init: true, // Initialize with README
          })
        } else {
          // Verify organization exists and user has access
          let orgExists = false
          let userHasAccess = false
          let userRole: string | null = null

          try {
            // Check if organization exists
            const orgResponse = await octokit.orgs.get({ org: owner })
            orgExists = true

            // Check user's membership and role in the organization
            try {
              const membershipResponse = await octokit.orgs.getMembershipForAuthenticatedUser({ org: owner })
              userHasAccess = true
              userRole = membershipResponse.data.role || null
            } catch (membershipError: unknown) {
              // User is not a member or doesn't have access
              if (
                membershipError &&
                typeof membershipError === 'object' &&
                'status' in membershipError &&
                membershipError.status === 404
              ) {
                userHasAccess = false
              } else {
                // Other error - log it but continue
                console.error('Error checking org membership:', membershipError)
              }
            }
          } catch (orgError: unknown) {
            // Organization doesn't exist or user can't access it
            if (orgError && typeof orgError === 'object' && 'status' in orgError && orgError.status === 404) {
              return NextResponse.json(
                {
                  error: `Organization "${owner}" not found. Please check the organization name and ensure you have access to it.`,
                },
                { status: 404 },
              )
            }
            // For other errors, continue to try creating the repo
            console.error('Error checking organization:', orgError)
          }

          // If we verified the org exists but user doesn't have access, provide specific error
          if (orgExists && !userHasAccess) {
            return NextResponse.json(
              {
                error: `You are not a member of the organization "${owner}". Please join the organization or create the repository in your personal account.`,
              },
              { status: 403 },
            )
          }

          // Try to create in organization
          try {
            repo = await octokit.repos.createInOrg({
              org: owner,
              name,
              description: description || undefined,
              private: isPrivate || false,
              auto_init: true, // Initialize with README
            })
          } catch (error: unknown) {
            // Log the full error for debugging
            console.error('Error creating repository in organization:', error)

            // Handle specific GitHub API errors
            if (error && typeof error === 'object' && 'status' in error) {
              const status = error.status as number
              let errorMessage = ''

              // Try to extract GitHub API error message
              if ('response' in error && error.response && typeof error.response === 'object') {
                const response = error.response as { data?: { message?: string } }
                if (response.data?.message) {
                  errorMessage = response.data.message
                  console.error('GitHub API error message:', errorMessage)
                }
              }

              if (status === 404) {
                // Could be org not found or no permission
                if (orgExists && userHasAccess) {
                  // Org exists and user has access, but still got 404 - likely permission issue
                  const message =
                    errorMessage ||
                    `You do not have permission to create repositories in "${owner}". Organization admins may need to grant you repository creation permissions.`
                  return NextResponse.json({ error: message }, { status: 403 })
                } else if (!orgExists) {
                  return NextResponse.json(
                    { error: `Organization "${owner}" not found. Please check the organization name.` },
                    { status: 404 },
                  )
                } else {
                  return NextResponse.json(
                    {
                      error: `Organization "${owner}" not found or you do not have permission to create repositories.`,
                    },
                    { status: 403 },
                  )
                }
              }

              if (status === 403) {
                const message =
                  errorMessage ||
                  `Permission denied. You may not have sufficient permissions in "${owner}" to create repositories. Contact your organization administrator.`
                return NextResponse.json({ error: message }, { status: 403 })
              }

              if (status === 422) {
                const message = errorMessage || 'Repository name is invalid or already exists in this organization'
                return NextResponse.json({ error: message }, { status: 422 })
              }
            }
            throw error
          }
        }
      } else {
        // Create in user's personal account if no owner specified
        repo = await octokit.repos.createForAuthenticatedUser({
          name,
          description: description || undefined,
          private: isPrivate || false,
          auto_init: true, // Initialize with README
        })
      }

      // If a template is selected, populate the repository
      if (template) {
        try {
          await populateRepoFromTemplate(octokit, repo.data.owner.login, repo.data.name, template as RepoTemplate)
        } catch (error) {
          console.error('Error populating repository from template:', error)
          // Don't fail the entire operation if template population fails
          // The repository was created successfully, just without template files
        }
      }

      return NextResponse.json({
        success: true,
        name: repo.data.name,
        full_name: repo.data.full_name,
        clone_url: repo.data.clone_url,
        html_url: repo.data.html_url,
        private: repo.data.private,
      })
    } catch (error: unknown) {
      console.error('GitHub API error:', error)

      // Handle specific GitHub API errors
      if (error && typeof error === 'object' && 'status' in error) {
        if (error.status === 422) {
          return NextResponse.json({ error: 'Repository already exists or name is invalid' }, { status: 422 })
        }

        if (error.status === 403) {
          return NextResponse.json(
            { error: 'You do not have permission to create repositories in this organization' },
            { status: 403 },
          )
        }
      }

      throw error
    }
  } catch (error) {
    console.error('Error creating repository:', error)
    return NextResponse.json({ error: 'Failed to create repository' }, { status: 500 })
  }
}
