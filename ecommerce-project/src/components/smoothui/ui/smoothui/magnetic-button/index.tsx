"use client";

import { Slot } from "@radix-ui/react-slot";
import { motion, useReducedMotion, useSpring } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import "../../../../unlumen-ui/primitives/magnetic-button.css";

export type MagneticButtonProps = {
  children: ReactNode;
  strength?: number;
  radius?: number;
  springConfig?: { duration?: number; bounce?: number };
  disabled?: boolean;
  asChild?: boolean;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
} & ButtonHTMLAttributes<HTMLButtonElement>;

const MagneticButton = ({
  children,
  strength = 0.3,
  radius = 150,
  springConfig = { bounce: 0.1, duration: 0.4 },
  disabled = false,
  asChild = false,
  variant = "default",
  size = "default",
  className = "",
  ...props
}: MagneticButtonProps) => {
  const shouldReduceMotion = useReducedMotion();
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const x = useSpring(0, {
    bounce: springConfig.bounce ?? 0.1,
    duration: springConfig.duration ?? 0.4,
  });
  const y = useSpring(0, {
    bounce: springConfig.bounce ?? 0.1,
    duration: springConfig.duration ?? 0.4,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    setIsHoverDevice(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsHoverDevice(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const isEffectDisabled = disabled || shouldReduceMotion || !isHoverDevice;

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isEffectDisabled || !buttonRef.current) {
        return;
      }

      const rect = buttonRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distanceX = event.clientX - centerX;
      const distanceY = event.clientY - centerY;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      if (distance < radius) {
        const factor = 1 - distance / radius;
        const moveX = distanceX * strength * factor;
        const moveY = distanceY * strength * factor;
        x.set(moveX);
        y.set(moveY);
      } else {
        x.set(0);
        y.set(0);
      }
    },
    [isEffectDisabled, radius, strength, x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  const Comp = asChild ? Slot : "button";
  const buttonClasses = `nx-mag-btn nx-mag-btn--${variant} nx-mag-btn--size-${size} ${className}`.trim();

  return (
    <div
      style={{
        display: "inline-block",
        margin: `-${radius / 2}px`,
        padding: `${radius / 2}px`,
      }}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      ref={wrapperRef}
      role="presentation"
    >
      <motion.div style={{ x, y }}>
        <Comp
          className={buttonClasses}
          disabled={disabled}
          ref={buttonRef}
          type="button"
          {...props}
        >
          {children}
        </Comp>
      </motion.div>
    </div>
  );
};

export default MagneticButton;
