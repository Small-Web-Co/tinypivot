# TinyPivot Build & Release Guide

## Local Development

```bash
# Install dependencies
pnpm install

# Run demo locally
pnpm demo

## Release Workflow

### 1. Update Version & Build

```bash
# Update version in package.json (e.g., 1.0.0 → 1.0.1)
# Then build the library
pnpm vite build --mode lib
```

### 2. Commit Your Changes

```bash
git add -A
git commit -m "feat: description of changes"
```

### 3. Tag the Release

```bash
# Create a version tag
git tag v1.0.1

# Push commits and tags to GitHub
git push origin master
git push origin --tags
```

### 4. Create GitHub Release

Go to: https://github.com/Small-Web-Co/tinypivot/releases/new

Select your tag and add changelog notes:

```markdown
## What's Changed
- Feature 1
- Feature 2
- Bug fix 1
```

Or via GitHub CLI:
```bash
gh release create v1.0.1 --title "v1.0.1" --notes "## What's Changed
- Feature 1
- Feature 2"
```

### 5. Publish to npm

```bash
# Login if needed
npm login

# Publish
pnpm publish --access public

OR ALL TOGETHER:
git add .gitignore BUILD.md
git commit -m "chore: add build guide, update gitignore"
git push origin master
pnpm publish --access public

```

### 6. Demo Deployment

The demo auto-deploys to Vercel on push to `master`.

Manual deploy:
```bash
vercel --prod
```

## Quick Release Checklist

- [ ] Update version in `package.json`
- [ ] Build: `pnpm vite build --mode lib`
- [ ] Commit changes
- [ ] Tag: `git tag vX.X.X`
- [ ] Push: `git push origin master --tags`
- [ ] Create GitHub release with changelog
- [ ] Publish: `pnpm publish --access public`

