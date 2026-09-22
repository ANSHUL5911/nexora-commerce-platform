"use client";

import { ChevronUp, CircleX, Share2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import useMeasure from "react-use-measure";
import "./ImageMetadataPreview.css";

export interface ImageMetadata {
  by: string;
  created: string;
  source: string;
  updated: string;
}

export interface ImageMetadataPreviewProps {
  alt?: string;
  description?: string;
  filename?: string;
  imageSrc: string;
  metadata: ImageMetadata;
  onShare?: () => void;
}

export default function ImageMetadataPreview({
  imageSrc,
  alt = "Image preview",
  filename = "screenshot.png",
  description = "No description",
  metadata,
  onShare,
}: ImageMetadataPreviewProps) {
  const [openInfo, setOpenInfo] = useState(false);
  const [elementRef, bounds] = useMeasure();
  const shouldReduceMotion = useReducedMotion();

  const handleToggleInfo = () => {
    setOpenInfo((prev) => !prev);
  };

  return (
    <div className="nx-imp-root">
      <motion.div
        animate={shouldReduceMotion ? {} : { y: openInfo ? -bounds.height : 0 }}
        className="nx-imp-image-card"
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          alt={alt}
          draggable={false}
          height={340}
          width={280}
          src={imageSrc}
          className="nx-imp-image"
        />
      </motion.div>

      <div className="nx-imp-controls-group">
        <div className="nx-imp-action-bar">
          <button
            aria-label="Share specimen dossier"
            className="nx-imp-btn"
            disabled={!onShare}
            onClick={onShare}
            type="button"
          >
            <Share2 aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="Archival record status"
            className="nx-imp-btn nx-imp-btn--status"
            disabled
            type="button"
          >
            Verified Artifact
          </button>
          <AnimatePresence>
            {!openInfo && (
              <motion.button
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                aria-label="Open Metadata Preview"
                className="nx-imp-btn"
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                onClick={handleToggleInfo}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
                type="button"
              >
                <ChevronUp aria-hidden="true" size={16} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {openInfo && (
            <motion.div
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              className="nx-imp-drawer"
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
              }
            >
              <div ref={elementRef}>
                <div className="nx-imp-drawer-header">
                  <div>
                    <h4 className="nx-imp-filename">{filename}</h4>
                    <p className="nx-imp-description">{description}</p>
                  </div>

                  <button
                    aria-label="Close metadata preview"
                    className="nx-imp-close-btn"
                    onClick={handleToggleInfo}
                    type="button"
                  >
                    <CircleX aria-hidden="true" size={18} />
                  </button>
                </div>

                <dl className="nx-imp-meta-list">
                  <div className="nx-imp-meta-row">
                    <dt className="nx-imp-meta-label">Created</dt>
                    <dd className="nx-imp-meta-value">{metadata.created}</dd>
                  </div>
                  <div className="nx-imp-meta-row">
                    <dt className="nx-imp-meta-label">Updated</dt>
                    <dd className="nx-imp-meta-value">{metadata.updated}</dd>
                  </div>
                  <div className="nx-imp-meta-row">
                    <dt className="nx-imp-meta-label">By</dt>
                    <dd className="nx-imp-meta-value">{metadata.by}</dd>
                  </div>
                  <div className="nx-imp-meta-row">
                    <dt className="nx-imp-meta-label">Source</dt>
                    <dd className="nx-imp-meta-value" title={metadata.source}>{metadata.source}</dd>
                  </div>
                </dl>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
