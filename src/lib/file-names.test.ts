import { describe, expect, it } from "vite-plus/test";
import { isImageName, isPreviewable, needsDecoding, splitName } from "./file-names";

describe("splitName", () => {
  it("splits an ordinary filename", () => {
    expect(splitName("IMG_0042.jpg")).toEqual({ base: "IMG_0042", ext: ".jpg" });
  });

  it("splits at the last dot", () => {
    expect(splitName("archive.tar.gz")).toEqual({ base: "archive.tar", ext: ".gz" });
  });

  it("treats a name with no dot as having no extension", () => {
    expect(splitName("README")).toEqual({ base: "README", ext: "" });
  });

  it("treats a leading dot as part of the name, not an extension", () => {
    // Our rename temp files are dotfiles, so this case is load-bearing.
    expect(splitName(".aperture-tmp-1")).toEqual({ base: ".aperture-tmp-1", ext: "" });
  });

  it("keeps the extension of a dotfile that has one", () => {
    expect(splitName(".aperture-tmp-1.jpg")).toEqual({ base: ".aperture-tmp-1", ext: ".jpg" });
  });

  it("handles a trailing dot", () => {
    expect(splitName("weird.")).toEqual({ base: "weird", ext: "." });
  });
});

describe("isImageName", () => {
  it.each([
    "photo.jpg",
    "photo.jpeg",
    "photo.PNG",
    "photo.Webp",
    "photo.avif",
    "photo.HEIC",
    "photo.tiff",
  ])("accepts %s", (name) => {
    expect(isImageName(name)).toBe(true);
  });

  it.each(["notes.txt", "movie.mp4", "photo", ".DS_Store", "photo.jpg.txt"])(
    "rejects %s",
    (name) => {
      expect(isImageName(name)).toBe(false);
    },
  );
});

describe("isPreviewable", () => {
  it.each(["photo.jpg", "photo.PNG", "photo.webp", "photo.avif", "photo.gif", "photo.bmp"])(
    "accepts %s, which the browser draws itself",
    (name) => {
      expect(isPreviewable(name)).toBe(true);
    },
  );

  // Chrome draws no HEIC, but Aperture decodes it — so it is previewable.
  it.each(["IMG_0042.heic", "IMG_0042.HEIC", "photo.heif"])(
    "accepts %s, which we decode",
    (name) => {
      expect(isPreviewable(name)).toBe(true);
    },
  );

  it.each(["scan.tif", "scan.TIFF"])("rejects %s, which nothing here can draw", (name) => {
    expect(isPreviewable(name)).toBe(false);
  });

  // A denylist, so anything unrecognised is attempted and falls back on `error`.
  it("attempts formats it does not recognise", () => {
    expect(isPreviewable("photo.jxl")).toBe(true);
    expect(isPreviewable("photo")).toBe(true);
  });
});

describe("needsDecoding", () => {
  it.each(["IMG_0042.heic", "IMG_0042.HEIC", "photo.heif", "photo.HEIF"])(
    "is true for %s",
    (name) => {
      expect(needsDecoding(name)).toBe(true);
    },
  );

  it.each(["photo.jpg", "photo.png", "scan.tiff", "photo", "notes.txt"])(
    "is false for %s",
    (name) => {
      expect(needsDecoding(name)).toBe(false);
    },
  );
});
