# @newstack/shared-types

TS types generated from `docs/openapi.yaml` — never from the DB schema (ARCHITECTURE §2,
§12: "Shared types from OpenAPI, not the DB"). `src/openapi.ts` is generated output; don't
hand-edit it, edit the spec and regenerate.

```bash
npm install
npm run generate
```

## Using it

No npm workspace is set up in this repo (each app manages its own `node_modules`
independently), so this isn't an installable package yet — import the generated file by
relative path:

```ts
import type { components } from '../../../packages/shared-types/src/openapi'

type FeedResponse = components['schemas']['FeedResponse']
```

`apps/web`'s features currently hand-write their own narrow types per screen (see each
feature's `types.ts`) rather than importing from here — this package exists so that choice
is optional, not mandatory. Switching a feature over is a mechanical, low-risk refactor
(swap the local interface for the matching `components['schemas'][...]` type) whenever it's
worth doing; nothing currently depends on it.
