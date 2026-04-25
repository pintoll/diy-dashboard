# Branching & Versioning

## Branch Flow

```
feature/* → dev → main (all via GitHub PR)
```

- **feature/\***: New features and fixes. Branch off `dev`.
- **dev**: Integration branch. Merge features here first.
- **main**: Production. Merge from `dev` when ready to release. Push to `main` triggers GitHub Actions → builds `.exe` + `latest.yml` → publishes to GitHub Releases.

## Versioning (SemVer)

Bump version **on the source branch before opening the PR to main**:

```bash
pnpm version patch   # 0.2.0 → 0.2.1 (bug fixes)
pnpm version minor   # 0.2.0 → 0.3.0 (new features)
pnpm version major   # 0.2.0 → 1.0.0 (breaking changes)
```

This creates a version commit + git tag. Push both: `git push && git push --tags`.

## Release Checklist

1. Finish work on `feature/*`, PR → `dev`
2. On `dev`: `pnpm version patch/minor`, push
3. PR `dev` → `main`, merge
4. GitHub Actions auto-publishes the release
5. Running apps detect the update on next launch via `electron-updater`
