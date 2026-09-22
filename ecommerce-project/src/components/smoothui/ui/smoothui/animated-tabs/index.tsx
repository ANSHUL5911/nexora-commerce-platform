"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useId, useState } from "react";
import "./AnimatedTabs.css";

export interface AnimatedTabsProps {
  activeTab?: string;
  className?: string;
  defaultTab?: string;
  layoutId?: string;
  onChange?: (tabId: string) => void;
  tabs: { id: string; label: string; icon?: ReactNode }[];
  variant?: "underline" | "pill" | "segment";
}

const SPRING = {
  bounce: 0.05,
  duration: 0.25,
  type: "spring" as const,
};

export default function AnimatedTabs({
  tabs,
  activeTab: controlledActiveTab,
  defaultTab,
  onChange,
  variant = "underline",
  layoutId: customLayoutId,
  className = "",
}: AnimatedTabsProps) {
  const shouldReduceMotion = useReducedMotion();
  const generatedId = useId();
  const layoutId = customLayoutId ?? `animated-tabs-${generatedId}`;

  const [internalActiveTab, setInternalActiveTab] = useState(
    defaultTab ?? tabs[0]?.id ?? ""
  );

  const isControlled = controlledActiveTab !== undefined;
  const activeTab = isControlled ? controlledActiveTab : internalActiveTab;

  const handleTabChange = useCallback(
    (tabId: string) => {
      if (!isControlled) {
        setInternalActiveTab(tabId);
      }
      onChange?.(tabId);
    },
    [isControlled, onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, currentIndex: number) => {
      let newIndex = currentIndex;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        newIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        newIndex = tabs.length - 1;
      } else {
        return;
      }

      const newTab = tabs[newIndex];
      if (newTab) {
        handleTabChange(newTab.id);
        const tabElement = document.getElementById(
          `${layoutId}-tab-${newTab.id}`
        );
        tabElement?.focus();
      }
    },
    [tabs, handleTabChange, layoutId]
  );

  const containerClass = `nx-tabs-container nx-tabs-container--${variant} ${className}`.trim();

  return (
    <div
      aria-label="Tabs"
      className={containerClass}
      role="tablist"
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        const buttonClass = `nx-tab-button ${isActive ? "nx-tab-button--active" : ""}`.trim();
        const indicatorClass = `nx-tab-indicator nx-tab-indicator--${variant}`;

        return (
          <button
            aria-selected={isActive}
            className={buttonClass}
            id={`${layoutId}-tab-${tab.id}`}
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {isActive && (
              <motion.span
                className={indicatorClass}
                layout
                layoutId={layoutId}
                transition={shouldReduceMotion ? { duration: 0 } : SPRING}
              />
            )}
            <span className="nx-tab-content">
              {tab.icon && <span>{tab.icon}</span>}
              <span>{tab.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
