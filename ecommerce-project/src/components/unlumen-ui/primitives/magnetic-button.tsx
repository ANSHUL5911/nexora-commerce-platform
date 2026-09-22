"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
  type SpringOptions,
  type HTMLMotionProps,
} from "motion/react";
import "./magnetic-button.css";

export interface MagneticButtonProps
  extends Omit<HTMLMotionProps<"button">, "style"> {
  /** activation radius in px — @default 100 */
  radius?: number;
  springOptions?: SpringOptions;
  /** pull strength multiplier 0–1 — @default 0.5 */
  strength?: number;
  asChild?: boolean;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  children?: React.ReactNode;
}

export function MagneticButton({
  children,
  radius = 100,
  springOptions = { stiffness: 150, damping: 15, mass: 0.1 },
  strength = 0.5,
  asChild = false,
  variant = "default",
  size = "default",
  className = "",
  ...props
}: MagneticButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const x = useSpring(rawX, springOptions);
  const y = useSpring(rawY, springOptions);

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (shouldReduceMotion) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        const pull = (1 - dist / radius) * strength;
        rawX.set(dx * pull);
        rawY.set(dy * pull);
      }
    },
    [radius, strength, rawX, rawY, shouldReduceMotion],
  );

  const handleMouseLeave = React.useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  const Comp = asChild ? Slot : motion.button;
  const classes = `nx-mag-btn nx-mag-btn--${variant} nx-mag-btn--size-${size} ${className}`.trim();

  return (
    <Comp
      ref={ref}
      style={shouldReduceMotion ? undefined : { x, y }}
      className={classes}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </Comp>
  );
}

export default MagneticButton;
