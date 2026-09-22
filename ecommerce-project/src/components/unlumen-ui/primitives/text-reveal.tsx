"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

export interface TextRevealProps {
  text: string;
  className?: string;
  splitBy?: "words" | "characters";
  staggerDelay?: number;
  duration?: number;
  as?: keyof React.JSX.IntrinsicElements;
}

export function TextReveal({
  text,
  className = "",
  splitBy = "words",
  staggerDelay = 0.05,
  duration = 0.4,
  as: Tag = "p",
}: TextRevealProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const prefersReduced = useReducedMotion();

  const units =
    splitBy === "words"
      ? text
          .split(/\s+/)
          .map((w, i, arr) => (i < arr.length - 1 ? w + "\u00A0" : w))
      : text.split("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AnyTag = Tag as any;

  return (
    <AnyTag
      ref={ref}
      className={`nx-text-reveal ${className}`.trim()}
      style={{ lineHeight: 1.625 }}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {units.map((unit, i) => (
          <motion.span
            key={i}
            initial={prefersReduced ? { opacity: 1, y: 0 } : { opacity: 1, y: 8 }}
            animate={
              isInView || prefersReduced
                ? { opacity: 1, y: 0 }
                : { opacity: 1, y: 8 }
            }
            transition={{
              duration: prefersReduced ? 0 : duration,
              delay: prefersReduced ? 0 : i * staggerDelay,
              ease: "easeOut",
            }}
            style={{ display: "inline-block", willChange: "transform, opacity" }}
          >
            {unit}
          </motion.span>
        ))}
      </span>
    </AnyTag>
  );
}

export default TextReveal;
