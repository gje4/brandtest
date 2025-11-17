<!-- 5eb16ea6-8dc7-42a0-ab64-a96d42135e1d f130bf38-dbf4-4b61-a6d2-30725ace2b3e -->
# Push v0 Output to GitHub

1. Capture the existing workspace changes produced by the v0 chat (files already written in repo) and ensure the authenticated GitHub repo/branch from header state is available to the chat flow.
2. Extend the chat workflow to trigger a deployment API call after v0 returns (pass owner/repo/branch + commit message) so the new `/api/github/push` endpoint runs automatically.
3. Surface status/feedback in the chat UI (success, no changes, or errors) so users know if the push succeeded and where to view the repo.