import { createApp } from "../server/src/app.js";

/**
 * Vercel serverless entry point.
 *
 * An Express app is a `(req, res)` function, which is exactly what Vercel's
 * Node runtime expects, so the app is exported directly rather than wrapped.
 *
 * The app is built once per instance at module scope. That is deliberate:
 * route registration is cheap and pure, so it costs nothing to repeat on a
 * cold start, and reusing it across warm invocations avoids rebuilding the
 * router on every request.
 *
 * What is NOT here matters more:
 *   - No `listen()`. Vercel owns the socket.
 *   - No `migrate()`. Schema changes must not run on a cold start; apply them
 *     deliberately with `npm run migrate` against the target database.
 *   - No sheet-cache warm. It costs ~40s and the instance may serve one
 *     request before being frozen. Neon is the source now anyway.
 *   - No SIGTERM handler. Vercel freezes instances; it does not signal them.
 */
export default createApp();
