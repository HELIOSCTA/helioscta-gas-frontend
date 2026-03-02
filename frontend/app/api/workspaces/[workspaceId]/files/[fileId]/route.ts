import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { downloadBlob, uploadBlob, deleteBlob } from "@/lib/blob";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface FileMetaRow {
  file_id: number;
  workspace_id: number;
  blob_path: string;
  file_type: string;
  mime_type: string;
  file_name: string;
}

async function getFileMeta(fileId: string, workspaceId: string): Promise<FileMetaRow | null> {
  const result = await query<FileMetaRow>(
    `SELECT file_id, workspace_id, blob_path, file_type, mime_type, file_name
     FROM helioscta_agents.workspace_files
     WHERE file_id = $1 AND workspace_id = $2 AND is_active = TRUE`,
    [fileId, workspaceId]
  );
  return result.rows[0] ?? null;
}

// GET /api/workspaces/[workspaceId]/files/[fileId] — download file content
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; fileId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { workspaceId, fileId } = await params;
  try {
    const meta = await getFileMeta(fileId, workspaceId);
    if (!meta) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await downloadBlob(meta.blob_path);

    // For text files, return JSON with content string
    const textTypes = ["md", "csv", "py", "sql", "json", "txt"];
    if (textTypes.includes(meta.file_type)) {
      return NextResponse.json({
        file_id: meta.file_id,
        file_name: meta.file_name,
        file_type: meta.file_type,
        content: buffer.toString("utf-8"),
      });
    }

    // For binary files (images), return raw buffer
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": meta.mime_type,
        "Content-Disposition": `inline; filename="${meta.file_name}"`,
      },
    });
  } catch (error) {
    console.error("[workspace-file] GET error:", error);
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}

// PUT /api/workspaces/[workspaceId]/files/[fileId] — update file content
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; fileId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { workspaceId, fileId } = await params;
  try {
    const meta = await getFileMeta(fileId, workspaceId);
    if (!meta) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const body = await request.json();
    const { content } = body;
    if (content === undefined) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const sizeBytes = Buffer.byteLength(contentStr);

    await uploadBlob(meta.blob_path, contentStr, meta.mime_type);

    await query(
      `UPDATE helioscta_agents.workspace_files
       SET size_bytes = $1, updated_at = NOW()
       WHERE file_id = $2`,
      [sizeBytes, fileId]
    );

    return NextResponse.json({ file_id: meta.file_id, size_bytes: sizeBytes });
  } catch (error) {
    console.error("[workspace-file] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update file" },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId]/files/[fileId] — soft-delete file
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; fileId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { workspaceId, fileId } = await params;
  try {
    const meta = await getFileMeta(fileId, workspaceId);
    if (!meta) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete from blob storage
    await deleteBlob(meta.blob_path);

    // Soft-delete metadata
    await query(
      `UPDATE helioscta_agents.workspace_files SET is_active = FALSE, updated_at = NOW() WHERE file_id = $1`,
      [fileId]
    );

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[workspace-file] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
