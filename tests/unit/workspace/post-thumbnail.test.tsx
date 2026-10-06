import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PostCaption, PostThumbnail } from "@/components/workspace/post-thumbnail";

// next/image is stubbed so the test asserts OUR contract (a real <img> inside
// a fixed box) rather than the optimizer's internals.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
    sizes,
    loading,
    onError,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    sizes?: string;
    loading?: string;
    onError?: () => void;
  }) => (
    // This IS the next/image stand-in, so a raw <img> is the point: the test
    // asserts the props PostThumbnail hands the real optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-testid="next-image"
      src={src}
      alt={alt}
      width={width}
      height={height}
      data-sizes={sizes}
      data-loading={loading}
      onError={onError}
    />
  ),
}));

describe("PostThumbnail", () => {
  it("renders a real image when a provider URL exists", () => {
    render(
      <PostThumbnail src="https://scontent.xx.fbcdn.net/v/t1.jpg" mediaType="image" size={40} />,
    );
    const box = screen.getByTestId("post-thumbnail");
    expect(box.style.width).toBe("40px");
    const img = screen.getByTestId("next-image");
    expect(img.getAttribute("src")).toBe("https://scontent.xx.fbcdn.net/v/t1.jpg");
    // Sized to what is actually rendered, so the optimizer does not ship the
    // full-resolution original, and lazy so off-screen cards stay cheap.
    expect(img.getAttribute("data-sizes")).toBe("40px");
    expect(img.getAttribute("data-loading")).toBe("lazy");
    // Reserved space before the bytes arrive: no layout shift.
    expect(img.getAttribute("width")).toBe("40");
    expect(img.getAttribute("height")).toBe("40");
  });

  it("renders the placeholder when the provider returned no image", () => {
    render(<PostThumbnail src={null} mediaType="reel" size={56} />);
    expect(screen.queryByTestId("next-image")).toBeNull();
    const placeholder = screen.getByTestId("post-thumbnail-placeholder");
    expect(placeholder.style.width).toBe("56px");
    expect(placeholder.getAttribute("data-media-type")).toBe("reel");
  });

  it("falls back to the placeholder when the image fails to load", () => {
    // Provider CDN links are short-lived and 403 once expired, so a failed
    // load must not leave a broken-image glyph in the row.
    render(<PostThumbnail src="https://scontent.xx.fbcdn.net/gone.jpg" mediaType="image" />);
    // fireEvent, not dispatchEvent: React delegates img onError at the root.
    fireEvent.error(screen.getByTestId("next-image"));
    expect(screen.getByTestId("post-thumbnail-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("post-thumbnail")).toBeNull();
  });

  it("is decorative: the account name beside it is the accessible name", () => {
    render(<PostThumbnail src="/e2e-thumbnails/post-0.svg" mediaType="image" />);
    expect(screen.getByTestId("post-thumbnail")).toHaveAttribute("aria-hidden", "true");
    // An empty alt on a decorative image stops it being announced twice.
    expect(screen.getByTestId("next-image").getAttribute("alt")).toBe("");
  });

  it("flags video media with a play affordance", () => {
    render(<PostThumbnail src={null} mediaType="video" />);
    expect(screen.getByTestId("post-thumbnail-placeholder").textContent).toMatch(/Video/);
  });
});

describe("PostCaption", () => {
  it("renders nothing when there is no caption", () => {
    const { container } = render(<PostCaption caption={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("keeps the full text available even though it is visually clamped", () => {
    const caption = "A long caption ".repeat(20);
    render(<PostCaption caption={caption} />);
    const node = screen.getByTestId("post-caption");
    // Truncation is a render-time concern: the DOM keeps the whole string and
    // exposes it as a tooltip rather than destroying text.
    expect(node.textContent).toBe(caption);
    expect(node.getAttribute("title")).toBe(caption);
    expect(node.className).toMatch(/line-clamp-2/);
  });
});
