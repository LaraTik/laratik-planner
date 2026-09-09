import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { exportDeliveryVersionZip, exportMediaAssetIdsZip } from "@/lib/media/collection-service";
import { MediaPermissionError } from "@/lib/media/service";
import { MediaZipTooLargeError } from "@/lib/exports/media-assets-zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.union([
  z.object({
    assetIds: z.array(z.string().uuid()).min(1).max(100),
    filenameBase: z.string().max(100).optional(),
  }),
  z.object({ deliveryVersionId: z.string().uuid() }),
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 });
  try {
    const result =
      "deliveryVersionId" in parsed.data
        ? await exportDeliveryVersionZip({ id: session.user.id }, parsed.data.deliveryVersionId)
        : await exportMediaAssetIdsZip(
            { id: session.user.id },
            parsed.data.assetIds,
            parsed.data.filenameBase,
          );
    const body = new Uint8Array(result.buffer);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (error instanceof MediaZipTooLargeError) {
      return NextResponse.json(
        {
          error: "The selected media is larger than the 500 MiB ZIP limit.",
          code: "media.zip_too_large",
        },
        { status: 413 },
      );
    }
    if (error instanceof MediaPermissionError) {
      return NextResponse.json(
        { error: error.message, code: "media.permission_denied" },
        { status: 403 },
      );
    }
    throw error;
  }
}
