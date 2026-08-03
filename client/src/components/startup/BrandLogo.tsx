import { motion } from "framer-motion";

/**
 * Utopia mark — a stacked-container glyph under a gantry hook.
 *
 * `animated` plays the reveal used on the startup screen: the hook descends,
 * then the stack builds bottom-up. Static elsewhere.
 */
export function BrandLogo({
  size = 56,
  animated = false,
  className = "",
}: {
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  // Olive base courses with a terracotta top box — the brand accents,
  // matching the warm palette rather than the raw SVG defaults.
  const stack = [
    { x: 6, y: 40, w: 24, h: 9, fill: "#6F7D4E" },
    { x: 34, y: 40, w: 24, h: 9, fill: "#8A9668" },
    { x: 20, y: 28, w: 24, h: 9, fill: "#C97C5D" },
    { x: 6, y: 52, w: 52, h: 9, fill: "#5D6A41" },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Utopia Fulfillment"
    >
      {/* gantry hook */}
      <motion.g
        initial={animated ? { opacity: 0, y: -10 } : false}
        animate={animated ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        <path
          d="M32 2 L32 18 M20 18 L44 18"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
      </motion.g>

      {stack.map((box, i) => (
        <motion.rect
          key={i}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx="1.5"
          fill={box.fill}
          initial={animated ? { opacity: 0, y: box.y + 8, scaleY: 0.6 } : false}
          animate={animated ? { opacity: 1, y: box.y, scaleY: 1 } : undefined}
          style={{ originY: 1 }}
          transition={{
            duration: 0.32,
            // Build bottom-up: the base course lands first.
            delay: 0.24 + (stack.length - 1 - i) * 0.09,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      ))}
    </svg>
  );
}
