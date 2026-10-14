---
name: git-workflow
description: "Manage Leather Vision's single parent repository without losing work or inventing GitHub remotes."
---

# Git Workflow

Read [the project guide](../../../CLAUDE.md). Run git status, branch, diff, and remote -v in the workspace root before changes. One repository tracks shopify_store, shopify_app/ai-image-rendering and shopify_app/automation-recommendations as ordinary files. Git commands inside either app resolve to the parent repository; npm commands run inside the relevant app.

The user-authorized origin is https://github.com/ans-firstmfg/Leather_vision.git. Verify it with git remote -v before publishing; never invent another destination. Master is the integration branch. Use codex/ prefixes for requested new branches unless the user names another branch. The historical ZIP replacement used separate repositories; the former app history and metadata are archived under .git/backups/ and excluded from commits.

Stage app changes with shopify_app/ai-image-rendering paths in the parent repository. Check each staged diff; don't fold unrelated edits into the task. Keep credentials, databases, images, dependencies, and generated build directories ignored. Do not reinitialize a nested app repository or recreate its former gitlink.

Preserve Git directories during archive replacement and back up working files, local credentials/data, and staged/unstaged changes before authorized destructive operations. Never copy archived Git history over the active checkout. Repair archived workspace links without deleting their targets.

Only commit/push/publish/merge when within the user's authorized workflow. A local branch does not create a remote branch. Do not force push, discard edits, or delete databases to obtain a clean status.

