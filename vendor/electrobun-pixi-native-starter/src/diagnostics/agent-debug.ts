import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export type AgentDebugHooks = {
	status(): unknown;
	tree(options: { depth: number; limit: number }): unknown;
	capture(): Promise<unknown>;
	command(command: Record<string, unknown>): Promise<unknown> | unknown;
};

const discoveryPath = process.env.PIXI_AGENT_DEBUG_DISCOVERY
	? resolve(process.env.PIXI_AGENT_DEBUG_DISCOVERY)
	: join(tmpdir(), "electrobun-pixi-debug.json");
const json = (value: unknown, status = 200) => Response.json(value, { status });

/** Loopback-only, token-authenticated control plane for agent-driven native UI debugging. */
export async function startAgentDebugBridge(hooks: AgentDebugHooks) {
	if (process.env.PIXI_AGENT_DEBUG === "0") return null;
	const token = crypto.randomUUID();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (request.headers.get("authorization") !== `Bearer ${token}`) {
				return json({ error: "unauthorized" }, 401);
			}
			try {
				if (request.method === "GET" && url.pathname === "/status") return json(hooks.status());
				if (request.method === "GET" && url.pathname === "/tree") {
					const depth = Math.max(0, Math.min(12, Number(url.searchParams.get("depth") ?? 4)));
					const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get("limit") ?? 200)));
					return json(hooks.tree({ depth, limit }));
				}
				if (request.method === "POST" && url.pathname === "/capture") return json(await hooks.capture());
				if (request.method === "POST" && url.pathname === "/command") {
					if (Number(request.headers.get("content-length") ?? 0) > 64 * 1024) {
						return json({ error: "request too large" }, 413);
					}
					return json(await hooks.command(await request.json()));
				}
				return json({ error: "not found" }, 404);
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 500);
			}
		},
	});
	await Bun.write(discoveryPath, JSON.stringify({ pid: process.pid, port: server.port, token }));
	console.log(`[AGENT-DEBUG] listening on 127.0.0.1:${server.port}`);
	let stopped = false;
	return {
		async stop() {
			if (stopped) return;
			stopped = true;
			server.stop(true);
			await rm(discoveryPath, { force: true }).catch(() => {});
		},
	};
}
