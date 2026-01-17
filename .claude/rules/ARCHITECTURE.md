# Architectural Standards: Strict FSD & Boundary Separation

## 1. FSD Layer Logic & Naming

Organize code based on **Scope** (Layer) and **Business Action** (Slice).

- **`shared/`**: Abstract primitives, UI kits, and utilities. **Must be domain-agnostic.**
- **`entities/`**: Domain business models (Data + Schema). Naming: Noun-based (e.g., `User`, `Cart`).
- **`features/`**: User-initiated business actions. **Naming: Verb-first** describing the value (e.g., `checkout-cart`, `auth-login`). strictly contains the logic for that specific action.
- **`widgets/`**: Composition roots. Combines `entities` and `features` into standalone UI blocks.
- **`app/`**: Routing and Layouts only.

**Dependency Rule:** Unidirectional flow only (`app` -> `widgets` -> `features` -> `entities` -> `shared`). Never import upwards.

## 2. Public API & Server/Client Separation

Enforce strict boundaries using specific Entry Points (Barrel Files) to prevent hydration mismatches.

### Component/Logic Authoring

- **Server Logic:** Must include `import 'server-only'` at the top of data-fetching/backend files.
- **Client Logic:** Must include `'use client'` at the top of interactive components.

### Public Export Pattern (The "Split-Index" Rule)

Do not use a single `index.ts` for mixed environments. Split exports by runtime:

1.  **`index.ts`**: Exports **types** and **shared logic** (universal).
2.  **`server.ts`**: Exports **Server Components** and backend utilities.
3.  **`client.ts`**: Exports **Client Components** and interactive hooks.

### Import Usage

- **Consumer:** `import { ... } from "@/widgets/my-widget/server"` (Explicitly targets the runtime).
