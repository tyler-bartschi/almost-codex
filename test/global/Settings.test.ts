import { FileSystemObject } from "../../src/global/Settings";

describe("FileSystemObject", () => {
  it("sets explicit type from constructor", () => {
    const fso = new FileSystemObject("notes.txt", "directory");

    expect(fso.type).toBe("directory");
    expect(fso.path).toBe("notes.txt");
  });

  it("infers directory type when path starts with slash", () => {
    const fso = new FileSystemObject("/etc/config");

    expect(fso.type).toBe("directory");
    expect(fso.path).toBe("/etc/config");
  });

  it("infers file type when path does not start with slash", () => {
    const fso = new FileSystemObject("relative/path.txt");

    expect(fso.type).toBe("file");
    expect(fso.path).toBe("relative/path.txt");
  });

  it("returns true for equals when type and path match", () => {
    const a = new FileSystemObject("/same/path", "directory");
    const b = new FileSystemObject("/same/path", "directory");

    expect(a.equals(b)).toBe(true);
  });

  it("returns false for equals when compared with non FileSystemObject", () => {
    const a = new FileSystemObject("/same/path", "directory");

    expect(a.equals("/same/path")).toBe(false);
    expect(a.equals({ path: "/same/path", type: "directory" })).toBe(false);
    expect(a.equals(null)).toBe(false);
  });

  it("returns false for equals when path differs", () => {
    const a = new FileSystemObject("/path/a", "directory");
    const b = new FileSystemObject("/path/b", "directory");

    expect(a.equals(b)).toBe(false);
  });

  it("returns false for equals when type differs", () => {
    const a = new FileSystemObject("same", "file");
    const b = new FileSystemObject("same", "directory");

    expect(a.equals(b)).toBe(false);
  });
});
