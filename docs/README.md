# Documentation index

Most of this directory is written by and for the AI agents that develop this repository, not for people evaluating or running ai-spy. If you landed here from the [main README](../README.md) looking for install or usage instructions, that README is the whole story; nothing below is required reading.

The files are kept in the repository on purpose. They are the project's working memory: an agent starting a fresh session reads them to find out what exists, what broke before, and what is still owed. Publishing them is a transparency choice, not an oversight.

## What each file is

| File | What it holds | Worth reading if you |
| --- | --- | --- |
| [STATUS.md](STATUS.md) | One-screen snapshot of what is currently built and working | want the short version of the project's state |
| [TODO.md](TODO.md) | Outstanding work, split into owner-authored and agent-authored items | want to know what is missing or planned |
| [handoff/architecture.md](handoff/architecture.md) | How the app is put together, and why each nonobvious decision went the way it did | are reading the source and want the reasoning behind it |
| [handoff/state.md](handoff/state.md) | Where the last session stopped and what it was mid-way through | are picking the project up, human or agent |
| [handoff/conventions.md](handoff/conventions.md) | Numbered project-specific patterns, currently empty | are contributing code |
| [handoff/credentials.md](handoff/credentials.md) | Names and lookup paths for secrets. Values are never recorded here | need to know where the optional observer secret comes from |
| [handoff/deployed.md](handoff/deployed.md) | Deployment truth. Empty, because ai-spy runs locally and is not deployed anywhere | wondered whether there is a hosted instance (there is not) |
| [handoff/specs-plans.md](handoff/specs-plans.md) | Index of active specifications and plans, currently empty | are looking for a design document |
| [handoff/sessions/](handoff/sessions/) | Dated log of what each development session did | want the project's history in narrative form |
| [handoff/bugs/](handoff/bugs/) | One record per diagnosed defect, with cause, fix, and lesson | hit something that looks like a known problem |

The format of the `handoff/` files is fixed by an external standard, which enforces section names and per-line length caps. That is why they read as terse bullets rather than prose.

## Elsewhere in the repository

`../.workflow/` holds working notes from specific development pushes. Two files there are genuinely useful to a reader:

- `.workflow/api-surface.md` documents the 1F916.ai public read API route by route: exact JSON shapes, caps, cursor semantics, and the places where the live responses disagreed with the forum's published source. It is the reference the Zod schemas in `web/src/api/schemas.ts` were written from.
- `.workflow/LEDGER.md` is the task ledger for those pushes, recording what each unit of work was and what evidence closed it.

`../CLAUDE.md` and `../AGENTS.md` are instruction files that AI coding assistants read automatically when they open this repository. They are assembled by tooling from a shared standards package and are not hand-edited. Neither affects the running application.
