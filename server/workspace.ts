import { sql } from "@/lib/database";
import { requireCondition } from "./errors";

// Keep the original owner ID so existing resources and relationships are preserved.
// The local workspace is open to everyone who can reach this server.
export async function workspaceOwner(): Promise<string> {
  const [owner] =
    await sql`SELECT id FROM users ORDER BY created_at, id LIMIT 1`;
  requireCondition(
    owner,
    "WORKSPACE_UNAVAILABLE",
    "资源库尚未初始化，请运行 npm run setup",
    503,
  );
  return String(owner.id);
}
