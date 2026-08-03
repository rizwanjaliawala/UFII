# Deployment

The application deploys to Vercel as one project: the Vite client as static
output, and the Express API as a single serverless function.

## Shape

| Piece | Where |
|---|---|
| Client | `client/dist`, served as static files |
| API | `api/index.ts`, exporting the Express app from `server/src/app.ts` |
| Database | Neon Postgres, **pooled** endpoint |

`server/src/index.ts` is the local development server only. It binds a port,
applies the schema and warms the sheet cache — none of which belongs in a
serverless function, where every cold start would repeat the work.

## Things that only fail once deployed

Three bugs reached production because local tooling hides them. Each cost a
deploy cycle; none is reproducible with `npm run dev`.

**1. `@tms/shared` must ship compiled JavaScript.**
Its package entry used to be `src/index.ts`. `tsx` and Vite compile TypeScript
on demand, so the local server and the client build were happy. Node is not —
the deployed function died with `ERR_MODULE_NOT_FOUND` resolving
`@tms/shared`. The entry now points at `dist/`, and `installCommand` builds
shared so its output exists before both the client build and the function
bundling.

**2. The repository root must declare `"type": "module"`.**
Vercel decides a function's module format from the nearest `package.json`.
`api/index.ts` sits at the root, outside every workspace. Without the
declaration Vercel emitted CommonJS while `server/` is ESM, and every request
failed with `ERR_REQUIRE_ESM`.

**3. The root `tsconfig.json` needs `skipLibCheck`.**
`googleapis` ships type definitions large enough to exhaust the build
container's heap. Without it the function build dies with
`Reached heap limit`, while the application itself is fine.

**`vercel.json` rejects unknown keys.** It is schema-validated, so `//comment`
keys fail the build — unlike `package.json`, which ignores them. Explanations
live in this file instead.

## Environment variables

Set in the Vercel dashboard, not committed:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** endpoint — the host containing `-pooler`. Strip `channel_binding=require`. Against the direct endpoint, cold starts exhaust the connection limit |
| `EDIT_KEY` | Optional. Absent means editing is disabled, which is the right default for a shared demo |

The pool drops to a single connection when `VERCEL=1`: each invocation is its
own process, so a larger pool multiplies across instances.

## Migrations do not run on deploy

`schema.sql` is applied deliberately, never on a cold start:

```bash
npm run migrate
```

## Access control

**The read API has no authentication.** Every `GET` is open — containers,
vendors, alerts, the D&D log. Deployment Protection is therefore the only
thing standing between the deployment and the public, and must stay on until
real authentication exists.

For demos, generate a Protection Bypass secret rather than disabling
protection: it produces a revocable link that works without a Vercel account,
and leaves the wall up for everyone else.

## Ingest

The ~16–35s ingest cannot run inside a request. Run it from a machine with the
source-sheet IDs configured, writing to the same database the deployment reads.
