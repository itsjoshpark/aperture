import { describe, expect, it } from "vite-plus/test";
import { isImageName, splitName } from "./file-names";

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
