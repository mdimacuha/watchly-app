---
alwaysApply: true
---

# Rule Router

If there is conflict:
- Follow simplicity
- Follow existing codebase
- Do not over-engineer

Determine the task type, then load the relevant rule and skill files.

## Routing

### Backend / API work
Use:
- rules/backend.md
- rules/database.md
- skills/backend.md
- skills/database.md

### Frontend / UI work
Use:
- rules/frontend.md
- skills/frontend.md

### Full feature / end-to-end
Use:
- rules/backend.md
- rules/database.md
- rules/frontend.md
- skills/backend.md
- skills/database.md
- skills/frontend.md
- skills/project.md

### Project / delivery / planning
Use:
- rules/project.md
- skills/project.md

## Always apply
- rules/global.md
- skills/global.md

## Behavior
- Do not load unnecessary files.
- Prefer the smallest set needed.
- If unclear, default to backend + project.
