---
name: git-workflow
description: "Manage Leather Vision's outer repository and nested app repository without losing work or inventing GitHub remotes."
---

# Git Workflow

Read [the project guide](../../../CLAUDE.md). Run git status, branch, diff, and remote -v in the workspace root and git -C shopify_app/ai-image-rendering before changes. The app is a nested repository recorded as a gitlink, not ordinary files tracked by the outer repository.

No remotes are configured and the user said not to add a GitHub repository. Do not infer remotes from connected accounts, archives, or previous examples. Use codex/ prefixes for requested new branches unless the user names another branch; coordinate both repositories when the task spans them. Current ZIP replacement was committed separately in each.

Stage app changes inside APP. If committing a task that changes the app and parent reference, commit the app first and then stage/commit its gitlink in the outer repository. Root CLAUDE.md/.claude skills are outer-repository files. Check each staged diff; don't fold unrelated edits into the task.

Preserve Git directories during archive replacement and back up working files, local credentials/data, and staged/unstaged changes before authorized destructive operations. Never copy archived Git history over the active checkout. Repair archived workspace links without deleting their targets.

Only commit/push/publish/merge when within the user's authorized workflow. A local branch does not create a remote branch. Do not force push, discard edits, or delete databases to obtain a clean status.

