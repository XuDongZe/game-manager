import JSZip from "jszip";

const ALLOWED_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "json", "wasm",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico",
  "mp3", "ogg", "wav", "mp4", "webm",
  "woff", "woff2", "ttf", "eot",
  "txt", "xml", "map",
]);

const SKIP_NAMES = new Set(["node_modules", ".git", ".DS_Store", "Thumbs.db"]);

function isAllowed(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
}

async function collectFiles(
  dirHandle: FileSystemDirectoryHandle,
  zip: JSZip,
  prefix: string
): Promise<number> {
  let count = 0;
  for await (const [name, entry] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (SKIP_NAMES.has(name)) continue;
    if (entry.kind === "directory") {
      count += await collectFiles(entry as FileSystemDirectoryHandle, zip, `${prefix}${name}/`);
    } else if (entry.kind === "file" && isAllowed(name)) {
      const file = await (entry as FileSystemFileHandle).getFile();
      zip.file(`${prefix}${name}`, file);
      count++;
    }
  }
  return count;
}

export async function packFolderToZip(
  dirHandle: FileSystemDirectoryHandle
): Promise<{ zip: File; fileCount: number }> {
  const jszip = new JSZip();
  const fileCount = await collectFiles(dirHandle, jszip, "");
  const blob = await jszip.generateAsync({ type: "blob" });
  const zip = new File([blob], `${dirHandle.name}.zip`, { type: "application/zip" });
  return { zip, fileCount };
}

export async function packFileListToZip(files: FileList): Promise<File> {
  const jszip = new JSZip();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const relativePath = (f as File & { webkitRelativePath: string }).webkitRelativePath;
    const parts = relativePath.split("/");
    const pathInZip = parts.slice(1).join("/");
    if (!pathInZip) continue;
    const filename = parts[parts.length - 1];
    if (SKIP_NAMES.has(filename)) continue;
    if (!isAllowed(filename)) continue;
    jszip.file(pathInZip, f);
  }
  const blob = await jszip.generateAsync({ type: "blob" });
  const folderName = files[0]
    ? (files[0] as File & { webkitRelativePath: string }).webkitRelativePath.split("/")[0]
    : "folder";
  return new File([blob], `${folderName}.zip`, { type: "application/zip" });
}
