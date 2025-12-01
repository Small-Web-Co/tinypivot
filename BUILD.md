# TinyPivot Build & Release Guide

## Local Development

```bash
pnpm install    # Install dependencies
pnpm demo       # Run demo locally
```

## Quick Release (One Command!)

```bash
# 1. Update version in package.json
# 2. Run:
pnpm release
```

This single command will:
- Build the library
- Commit all changes
- Create git tag
- Push to GitHub
- Publish to npm

## Manual Release Steps

If you need more control:

```bash
# 1. Update version in package.json (e.g., 1.0.2 → 1.0.3)

# 2. Build
pnpm build:lib

# 3. Commit, tag, push
git add -A
git commit -m "chore: release v1.0.3"
git tag v1.0.3
git push origin master --tags

# 4. Publish to npm
pnpm publish --access public --no-git-checks
```

## Create GitHub Release (Optional)

After publishing, create a release with changelog:

```bash
gh release create v1.0.3 --title "v1.0.3" --notes "## What's Changed
- Feature 1
- Bug fix 1"
```

Or go to: https://github.com/Small-Web-Co/tinypivot/releases/new

## Demo Deployment

Auto-deploys to Vercel on push to `master`.
