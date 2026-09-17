import { session } from "@/lib/platform/auth";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { db } = await session();
  const { id } = await params;
  const document = await db
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (document.error || !document.data)
    return new Response("Document unavailable", { status: 404 });
  const result = await db.storage
    .from("project-documents")
    .createSignedUrl(document.data.storage_path, 60, { download: true });
  if (result.error)
    return new Response("Unable to create download link", { status: 403 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: result.data.signedUrl,
      "Cache-Control": "private, no-store",
    },
  });
}
