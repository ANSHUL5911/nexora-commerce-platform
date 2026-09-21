import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { MagneticButton } from "./components/unlumen-ui/primitives/magnetic-button";
import { TextReveal } from "./components/unlumen-ui/primitives/text-reveal";
import AnimatedTabs from "./components/smoothui/ui/smoothui/animated-tabs";
import ImageMetadataPreview from "./components/smoothui/ui/smoothui/image-metadata-preview";

describe("real library components import & render", () => {
  it("renders Unlumen MagneticButton", () => {
    const { getByText } = render(
      <MagneticButton className="test-btn">Explore Collection</MagneticButton>
    );
    expect(getByText("Explore Collection")).toBeDefined();
  });

  it("renders Unlumen TextReveal", () => {
    const { getByText } = render(
      <TextReveal text="Material Before Ornament" />
    );
    expect(getByText("Material")).toBeDefined();
  });

  it("renders SmoothUI AnimatedTabs", () => {
    const tabs = [
      { id: "all", label: "All Objects" },
      { id: "apparel", label: "Apparel" },
    ];
    const { getByText } = render(<AnimatedTabs tabs={tabs} defaultTab="all" />);
    expect(getByText("All Objects")).toBeDefined();
    expect(getByText("Apparel")).toBeDefined();
  });

  it("renders SmoothUI ImageMetadataPreview", () => {
    const metadata = {
      by: "Nexora Studio",
      created: "2026-09-01",
      source: "Tokyo Atelier",
      updated: "2026-09-20",
    };
    const { getByAltText } = render(
      <ImageMetadataPreview
        imageSrc="data:image/svg+xml;utf8,<svg></svg>"
        alt="Highlight Object"
        filename="architectural-artifact.png"
        description="Handcrafted living vessel"
        metadata={metadata}
      />
    );
    expect(getByAltText("Highlight Object")).toBeDefined();
  });
});
