# GitHub Transfer Checklist

Use this checklist to move the current RunNation app into GitHub without leaking secrets or losing local work.

## 1. Confirm What Should Be Committed

Check the working tree:

```bash
git status --short
```

The current workspace has many modified and untracked files. Review them before the first commit:

```bash
git diff --stat
git diff -- app/(tabs)/index.tsx
git diff -- app/settings.tsx
```

Do not run destructive cleanup commands unless you are sure. Keep local changes unless they are intentionally removed.

## 2. Confirm Secrets Are Not Included

These should stay untracked:

- `.env`
- `.env.*`
- `backend/.env`
- `backend/.env.*`
- Supabase local state such as `supabase/.temp`, `supabase/.branches`, `supabase/.cache`.

Templates that should be committed:

- `.env.example`
- `backend/.env.example`

Before pushing, search for accidental secrets:

```bash
git grep -n "SUPABASE_SERVICE_ROLE_KEY"
git grep -n "eyJ"
git grep -n "postgres://"
```

Manual review is still required; secret scanners are helpful but not perfect.

## 3. Verify The App

TypeScript currently passes:

```bash
npx tsc --noEmit
```

Lint currently has existing failures in:

- `app/admin.tsx`
- `app/cart.tsx`
- `app/subscription.tsx`

Run lint when ready:

```bash
npm run lint
```

## 4. Create A Branch

Recommended branch name:

```bash
git switch -c codex/runnation-github-handoff
```

If the branch already exists:

```bash
git switch codex/runnation-github-handoff
```

## 5. Stage Deliberately

Because this workspace has many files, stage intentionally:

```bash
git add README.md docs/APP_DOCUMENTATION.md docs/GITHUB_TRANSFER.md
git add .env.example backend/.env.example
git add app backend components constants contexts lib supabase utils package.json bun.lock package-lock.json app.json
```

Then inspect:

```bash
git status --short
git diff --cached --stat
```

If something appears that should not be committed, unstage it:

```bash
git restore --staged path/to/file
```

## 6. Commit

Use a clear first handoff commit:

```bash
git commit -m "Prepare RunNation app for GitHub handoff"
```

## 7. Create GitHub Repository

Create an empty GitHub repo, then connect it:

```bash
git remote add origin https://github.com/YOUR_ORG/YOUR_REPO.git
git remote -v
```

If `origin` already exists, update it:

```bash
git remote set-url origin https://github.com/YOUR_ORG/YOUR_REPO.git
```

## 8. Push

```bash
git push -u origin codex/runnation-github-handoff
```

Then open a pull request or make it the main branch depending on your GitHub workflow.

## 9. Recommended GitHub Settings

- Protect `main`.
- Require pull requests for changes to `main`.
- Add repository secrets for production deploys instead of committing env values.
- Add branch protection after the first clean CI workflow exists.
- Consider enabling GitHub secret scanning and Dependabot alerts.

## 10. Suggested First GitHub Issues

- Fix lint errors in `app/admin.tsx`, `app/cart.tsx`, and `app/subscription.tsx`.
- Add CI that runs `npx tsc --noEmit`.
- Add CI lint after the existing lint errors are fixed.
- Confirm Supabase migrations apply cleanly to a fresh project.
- Add screenshot/image sharing for the RunNation activity card if native image export is required.
