import WorkbenchClient from "./WorkbenchClient";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return <WorkbenchClient workspaceId={workspaceId} />;
}
