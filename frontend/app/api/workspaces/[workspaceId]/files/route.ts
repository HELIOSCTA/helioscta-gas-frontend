import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uploadBlob } from "@/lib/blob";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface FileRow {
  file_id: number;
  workspace_id: number;
  file_name: string;
  blob_path: string;
  file_type: string;
  mime_type: string;
  size_bytes: number | null;
  parent_path: string;
  source: string;
  conversation_id: number | null;
  message_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const MIME_MAP: Record<string, string> = {
  md: "text/markdown",
  csv: "text/csv",
  py: "text/x-python",
  sql: "text/x-sql",
  png: "image/png",
  svg: "image/svg+xml",
  json: "application/json",
  txt: "text/plain",
};

function getFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "txt";
  return ext;
}

function getMimeType(fileName: string): string {
  const ext = getFileType(fileName);
  return MIME_MAP[ext] ?? "application/octet-stream";
}

// GET /api/workspaces/[workspaceId]/files — list files in workspace
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { workspaceId } = await params;
  try {
    const result = await query<FileRow>(
      `SELECT file_id, workspace_id, file_name, blob_path, file_type, mime_type,
              size_bytes, parent_path, source, conversation_id, message_id,
              created_by, created_at, updated_at
       FROM helioscta_agents.workspace_files
       WHERE workspace_id = $1 AND is_active = TRUE
       ORDER BY parent_path, file_name`,
      [workspaceId]
    );
    return NextResponse.json({ files: result.rows });
  } catch (error) {
    console.error("[workspace-files] GET error:", error);
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/files — upload/create a file
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  const { workspaceId } = await params;
  try {
    const body = await request.json();
    const {
      fileName,
      content,
      parentPath = "/",
      source = "upload",
      conversationId,
      messageId,
    } = body;
    const createdBy = body.createdBy ?? userEmail;

    if (!fileName || content === undefined) {
      return NextResponse.json(
        { error: "fileName and content are required" },
        { status: 400 }
      );
    }

    // Look up workspace to build blob path
    const wsResult = await query<{ slug: string; workspace_type: string; agent_id: string | null }>(
      `SELECT slug, workspace_type, agent_id FROM helioscta_agents.workspaces WHERE workspace_id = $1`,
      [workspaceId]
    );
    if (wsResult.rows.length === 0) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const ws = wsResult.rows[0];

    // Build blob path
    const prefix =
      ws.workspace_type === "agent" && ws.agent_id
        ? `agents/${ws.agent_id}`
        : `projects/${ws.slug}`;
    const cleanParent = parentPath === "/" ? "" : parentPath.replace(/^\/|\/$/g, "") + "/";
    const blobPath = `${prefix}/${cleanParent}${fileName}`;

    const fileType = getFileType(fileName);
    const mimeType = getMimeType(fileName);
    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const sizeBytes = Buffer.byteLength(contentStr);

    // Upload to blob storage
    await uploadBlob(blobPath, contentStr, mimeType);

    // Insert metadata row
    const result = await query<{ file_id: number }>(
      `INSERT INTO helioscta_agents.workspace_files
         (workspace_id, file_name, blob_path, file_type, mime_type, size_bytes, parent_path, source, conversation_id, message_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (blob_path) DO UPDATE SET
         size_bytes = EXCLUDED.size_bytes,
         updated_at = NOW(),
         is_active = TRUE
       RETURNING file_id`,
      [
        workspaceId,
        fileName,
        blobPath,
        fileType,
        mimeType,
        sizeBytes,
        parentPath,
        source,
        conversationId ?? null,
        messageId ?? null,
        createdBy ?? null,
      ]
    );

    return NextResponse.json({
      file_id: result.rows[0].file_id,
      blob_path: blobPath,
      file_type: fileType,
    });
  } catch (error) {
    console.error("[workspace-files] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create file" },
      { status: 500 }
    );
  }
}
