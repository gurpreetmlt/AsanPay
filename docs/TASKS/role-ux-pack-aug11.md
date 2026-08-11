# Role UX pack (Aug 2026) — `feat/role-ux-pack-aug11`

Revertible feature pack. **If you dislike it**, switch back to `main` (or revert the merge commit).

## What shipped

1. **Active bank highlight** — green ring on Active settlement bank cards (web + mobile)
2. **Settlement timeline** — Requested → Processing → Paid/Failed under each settlement row
3. **Admin bank verify** — primary entry on **Agents → Retailers** (banner + badge); Settlements keeps Pending banks tab for ops
4. **Dist / SD home** — Commission MTD + inactive downline CTA
5. **Retailer** — Low Main balance (&lt; ₹500) Add Money banner + Share receipt on recent txns
6. **BBPS** — “Coming soon” badge (no fake unlock)

## Revert options

```bash
# Still on the feature branch (not merged):
git checkout main

# After merge to main — undo the merge commit:
git revert -m 1 <merge-commit-sha>
git push

# Or hard reset only if NOT shared / you accept force (prefer revert):
# git reset --hard origin/main
```

## Deploy

Push branch or merge → Coolify redeploy **backend** + **agent-portal** + **admin-portal**.
Migrate: not required (API response fields only).
