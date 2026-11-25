import { AppError, errorResponse, requireSameOrigin } from "@/lib/errors";
import { identifyCover } from "@/lib/cover";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const signatures: Record<string, (image: Buffer) => boolean> = {
  "image/jpeg": (image) => image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff,
  "image/png": (image) => image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/webp": (image) => image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP",
};

export async function POST(request: Request) {
  try {
    requireSameOrigin(request, "Cover identification requests must come from this app.");
    const mimeType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!Object.hasOwn(signatures, mimeType)) {
      throw new AppError("Choose a JPEG, PNG, or WebP cover photo. Convert HEIC images first.", 415);
    }
    if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES) {
      throw new AppError("Cover photos must be 5 MB or smaller.", 413);
    }
    if (!request.body) throw new AppError("Choose a cover photo first.", 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new AppError("Cover photos must be 5 MB or smaller.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const image = Buffer.concat(chunks, size);
    if (!size) throw new AppError("Choose a nonempty cover photo.", 400);
    if (!signatures[mimeType](image)) {
      throw new AppError("The file does not match its image format. Choose a valid JPEG, PNG, or WebP photo.", 415);
    }
    const title = await identifyCover(image, mimeType);
    return Response.json({ title }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
