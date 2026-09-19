import { randomBytes } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";

/** Extensions we accept, keyed by the content type the client sent. */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const UPLOADS_DIR = path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? "uploads");

export class UnsupportedImageTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported image type "${mimeType}"`);
    this.name = "UnsupportedImageTypeError";
  }
}

export const ensureUploadsDir = () => mkdir(UPLOADS_DIR, { recursive: true });

/**
 * Names are generated here rather than taken from the upload: a client-supplied
 * filename can contain path separators and escape the uploads directory.
 */
export const buildImageKey = (mimeType: string) => {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];

  if (!extension) {
    throw new UnsupportedImageTypeError(mimeType);
  }

  return `${randomBytes(16).toString("hex")}.${extension}`;
};

export const resolveUploadPath = (key: string) => path.join(UPLOADS_DIR, path.basename(key));

/** Best effort: a missing file should not fail the request that triggered it. */
export const deleteUpload = async (key: string | null | undefined) => {
  if (!key) return;

  await unlink(resolveUploadPath(key)).catch(() => undefined);
};
