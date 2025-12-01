# TinyPivot Build & Release Guide

## Local Development

```bash
pnpm install    # Install dependencies
pnpm demo       # Run demo locally
```

## Quick Release (One Command!)

```bash
pnpm release          # Patch: 1.0.4 → 1.0.5
pnpm release:minor    # Minor: 1.0.4 → 1.1.0
pnpm release:major    # Major: 1.0.4 → 2.0.0
```

Each command will automatically:
1. Bump the version in package.json
2. Build the library
3. Commit all changes
4. Create git tag
5. Push to GitHub
6. Publish to npm

## Create GitHub Release (Optional)

After publishing, create a release with changelog:

```bash
gh release create v1.0.5 --title "v1.0.5" --notes "## What's Changed
- Feature 1
- Bug fix 1"
```

Or go to: https://github.com/Small-Web-Co/tinypivot/releases/new

## Demo Deployment

Auto-deploys to Vercel on push to `master`.
