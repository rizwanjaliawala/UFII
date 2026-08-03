import { motion, useReducedMotion } from "framer-motion";

/**
 * Animated backdrop for the startup and login screens.
 *
 * Uses the brand photograph with a very slow Ken Burns drift and a warm
 * scrim, replacing the previous SVG port scene now that the application has a
 * photographic background.
 *
 * Performance: only `transform` and `opacity` animate, so the whole effect
 * lives on the compositor and holds 60 FPS. The image is already fetched for
 * the app background, so this costs no extra network.
 *
 * Scope: startup and login only. It must never sit behind operational data.
 */
export function PhotoBackdrop({ dim = 0.55 }: { dim?: number }) {
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/truck-bg.jpg)" }}
        initial={{ scale: 1.08, opacity: 0 }}
        animate={{ scale: reduce ? 1.04 : 1.0, opacity: 1 }}
        transition={{
          opacity: { duration: 0.9, ease: "easeOut" },
          scale: { duration: reduce ? 0 : 24, ease: "linear" },
        }}
      />

      {/* Warm scrim — the photograph must stay subordinate to the status
          panel and progress read out on top of it. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(155deg,
            rgba(248,245,240,${dim}) 0%,
            rgba(248,245,240,${Math.min(0.97, dim + 0.24)}) 55%,
            rgba(242,236,228,${Math.min(0.98, dim + 0.32)}) 100%)`,
        }}
      />

      {/* A single terracotta bloom picks up the truck without tinting the
          whole frame. */}
      <div
        className="absolute -top-32 -left-24 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(201,124,93,0.32) 0%, rgba(201,124,93,0) 70%)",
        }}
      />

      {!reduce && <Motes />}
    </div>
  );
}

/** Slow-drifting warm motes. Pure transform/opacity — effectively free. */
function Motes() {
  const motes = [
    { x: "18%", y: "34%", size: 5, dur: 13, delay: 0 },
    { x: "42%", y: "22%", size: 4, dur: 16, delay: 1.8 },
    { x: "67%", y: "40%", size: 6, dur: 14, delay: 0.9 },
    { x: "82%", y: "26%", size: 4, dur: 18, delay: 2.6 },
    { x: "29%", y: "58%", size: 5, dur: 15, delay: 3.4 },
  ];

  return (
    <>
      {motes.map((m, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: m.x,
            top: m.y,
            width: m.size,
            height: m.size,
            background: "rgba(201,124,93,0.55)",
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.6, 0], y: [-4, -46, -84] }}
          transition={{
            duration: m.dur,
            delay: m.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}
