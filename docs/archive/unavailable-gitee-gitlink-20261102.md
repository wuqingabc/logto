# Unavailable historical submodule commit

Remote wrapper commit `592aa9123` changes only the Logto gitlink from `b81e5554a91882371f5c215a2b4373c8bf5e0a10` to `5dc69de2e22eb6b080bc85ab8d0639697e03789c`, with subject “ignore .DS_Store”. The target object exists in neither the wrapper object database nor the initialized submodule. An explicit fetch from the configured official upstream returned `upload-pack: not our ref` on 2026-11-02.

The current pinned upstream `79e9e3b0d9f505260d09c80d8a015e56fbc0ec01` and verified patch stack remain authoritative. The old pointer cannot be content-audited until its original object is supplied. The wrapper commit is retained by a history-only merge while preserving the current upgraded gitlink. This records the original pointer and commit ancestry; it does not claim the unavailable submodule content was recovered or verified. The remote tracking branch remains unchanged. No submodule working files were altered.
