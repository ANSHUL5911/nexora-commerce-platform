import { describe, it, expect } from "vitest";
import {
  normalizeProductImage,
  handleImageError,
  ARCHITECTURAL_PLACEHOLDER_SVG,
  CATEGORY_FALLBACK_IMAGES,
} from "./media";

describe("media normalization", () => {
  it("normalizes missing or empty image to category fallback or SVG", () => {
    expect(normalizeProductImage(null, "APPAREL")).toBe(CATEGORY_FALLBACK_IMAGES.APPAREL);
    expect(normalizeProductImage(undefined, "UNKNOWN")).toBe(ARCHITECTURAL_PLACEHOLDER_SVG);
    expect(normalizeProductImage("", "FOOTWEAR")).toBe(CATEGORY_FALLBACK_IMAGES.FOOTWEAR);
  });

  it("fixes malformed seed URL like chronograph", () => {
    expect(normalizeProductImage("https://images.unsplash.com/chronograph", "ACCESSORIES")).toBe(
      CATEGORY_FALLBACK_IMAGES.ACCESSORIES
    );
  });

  it("adds leading slash to relative image paths", () => {
    expect(normalizeProductImage("images/products/bag.jpg")).toBe("/images/products/bag.jpg");
    expect(normalizeProductImage("/images/products/bag.jpg")).toBe("/images/products/bag.jpg");
  });

  it("preserves valid https and data URIs", () => {
    const validUrl = "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop";
    expect(normalizeProductImage(validUrl)).toBe(validUrl);
    expect(normalizeProductImage("data:image/svg+xml;base64,...")).toBe("data:image/svg+xml;base64,...");
  });

  it("handles image error event gracefully", () => {
    const fakeImg = { src: "https://invalid-domain.xyz/broken.jpg" };
    handleImageError({ currentTarget: fakeImg }, "LIVING");
    expect(fakeImg.src).toBe(CATEGORY_FALLBACK_IMAGES.LIVING);

    // Second error swaps to SVG
    handleImageError({ currentTarget: fakeImg }, "LIVING");
    expect(fakeImg.src).toBe(ARCHITECTURAL_PLACEHOLDER_SVG);
  });
});
