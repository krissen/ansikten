# Rebranding Plan: "Hitta ansikten" → "Ansikten"

## Goal

Rename the product and repo to **Ansikten**, fully replacing older names **Hitta ansikten** and **Bildvisare** across app UI, docs, repository, and local folder structure.

---

## Scope

- App UI strings, window title, About dialog, menus
- Packaging metadata (Electron `package.json`, app ID, product name)
- CLI/tooling and docs references
- Repository rename + remote URL update
- Local folder rename

## Non-Goals

- Performance regressions or CDN dependency (offline-first)
- UI redesign or feature changes

## Assumptions

- New repo URL will be provided by the user
- App icons and visual identity remain unchanged unless requested
- All docs remain in English except proper nouns

---

## Plan (Phased)

### Phase 1 — Inventory & Decisions

1. Confirm new repo URL and target local folder name.
2. Decide whether **Ansikten** is the only user-facing name (no "Hitta ansikten" fallback).
3. Confirm app ID strategy:
   - **Option A**: Keep `appId` (`se.krissen.bildvisare`) to avoid OS upgrade issues
   - **Option B**: Change `appId` to `se.krissen.ansikten` (clean break)

### Phase 2 — Codebase Rename

#### 2.1 App Metadata

| File | Fields to Update |
|------|------------------|
| `frontend/package.json` | `name`, `productName`, `description`, `build.appId` |
| `frontend/src/main/menu.js` | App name in menu labels, About dialog text |
| Window title | If configured in renderer |

#### 2.2 UI Strings

- Replace all occurrences of "Hitta ansikten" and "Bildvisare" with "Ansikten"
- Update any help text or banners referencing the old name

#### 2.3 CLI / Backend

- Update CLI output or help messages if they mention the old names
- Check `backend/*.py` for references

#### 2.4 Documentation

| Location | Action |
|----------|--------|
| `README.md` | Update title, description, references |
| `TODO.md` | Update project name references |
| `AGENTS.md` | Update if project name mentioned |
| `docs/**/*.md` | Search and replace old names |

### Phase 3 — Repository Rename

1. **User action**: Rename repo on GitHub (Settings → Rename)
2. Update local remote:
   ```bash
   git remote set-url origin <new-url>
   ```
3. Update any references in docs to old repo URL (`github.com/krissen/hitta_ansikten`)

### Phase 4 — Local Folder Rename

1. Rename folder: `hitta_ansikten` → `ansikten`
2. Update any local scripts or paths referencing the old folder name
3. Verify any absolute paths in scripts/docs

### Phase 5 — Validation

- [ ] Build app and confirm About dialog + menu labels show "Ansikten"
- [ ] Verify app launches with correct window title
- [ ] Ensure docs and README reflect new repo name and URL
- [ ] Run tests to confirm nothing broke
- [ ] Check that git remote points to new URL

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Changing `appId` breaks OS updates | Users may need to reinstall | Keep existing `appId` unless explicitly requested |
| External links to old repo | Broken links | Search/replace all URLs before release |
| Hardcoded paths in scripts | Build failures | Validate after folder rename |
| Cached references in IDE/tools | Confusion | Clear caches, restart tools |

---

## Files to Modify (Inventory)

### Frontend

```
frontend/package.json
frontend/src/main/menu.js
frontend/src/renderer/components/*.jsx (if name appears)
```

### Backend

```
backend/hitta_ansikten.py (filename + references)
backend/api/main.py (if name in logs/docs)
```

### Documentation

```
README.md
TODO.md
AGENTS.md
docs/dev/*.md
docs/user/*.md
```

### Git

```
.git/config (remote URL)
```

---

## Deliverables Checklist

- [ ] App UI name changed everywhere
- [ ] Electron package metadata updated
- [ ] All docs updated
- [ ] Repo renamed on GitHub
- [ ] Local remote URL updated
- [ ] Local folder renamed
- [ ] No references to "Bildvisare" remain
- [ ] No references to "Hitta ansikten" remain (except historical changelog)
- [ ] Tests pass
- [ ] App builds and runs correctly

---

## Execution Notes

When ready to execute:

1. Create a branch: `git checkout -b refactor/rebrand-ansikten`
2. Execute Phase 2 (codebase changes)
3. Commit: `(rebrand) Rename to Ansikten`
4. User renames repo on GitHub
5. Execute Phase 3 (update remote)
6. Execute Phase 4 (local folder - user action)
7. Execute Phase 5 (validation)
8. Merge to dev
