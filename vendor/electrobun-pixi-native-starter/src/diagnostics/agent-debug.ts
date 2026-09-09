import { rm, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerDebugInstance, publicInstance } from "./debug-registry";

export type AgentDebugHooks = {
	status(): unknown;
	tree(options: { depth: number; limit: number }): unknown;
	capture(): Promise<unknown>;
	command(command: Record<string, unknown>): Promise<unknown> | unknown;
  identity?: {name:string;build:string;isolated:boolean};
  capabilities?():unknown;
};

const discoveryPath = process.env.PIXI_AGENT_DEBUG_DISCOVERY
	? resolve(process.env.PIXI_AGENT_DEBUG_DISCOVERY)
	: join(tmpdir(), "electrobun-pixi-debug.json");
const json = (value: unknown, status = 200) => Response.json(value, { status });

/** Loopback-only, token-authenticated control plane for agent-driven native UI debugging. */
export async function startAgentDebugBridge(hooks: AgentDebugHooks) {
	if (process.env.PIXI_AGENT_DEBUG === "0") return null;
	const token = crypto.randomUUID();
  const instanceId=crypto.randomUUID();
  let identity:ReturnType<typeof publicInstance>;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (request.headers.get("authorization") !== `Bearer ${token}`) {
				return json({ error: "unauthorized" }, 401);
			}
			try {
        if(request.method==="GET"&&url.pathname==="/identity")return json(identity);
        if(request.method==="GET"&&url.pathname==="/capabilities")return json(hooks.capabilities?.()??{legacy:true});
				if (request.method === "GET" && url.pathname === "/status") return json(hooks.status());
				if (request.method === "GET" && url.pathname === "/tree") {
          const depth=Number(url.searchParams.get("depth")??4),limit=Number(url.searchParams.get("limit")??200);
          if(!Number.isInteger(depth)||depth<0||depth>12||!Number.isInteger(limit)||limit<1||limit>2000)return json({error:"Invalid tree bounds"},400);
					return json(hooks.tree({ depth, limit }));
				}
				if (request.method === "POST" && url.pathname === "/capture") return json(await hooks.capture());
				if (request.method === "POST" && url.pathname === "/command") {
					if (Number(request.headers.get("content-length") ?? 0) > 64 * 1024) {
						return json({ error: "request too large" }, 413);
					}
          if(request.headers.has("origin"))return json({error:"Browser-origin commands are not accepted"},403);
          const reader=request.body?.getReader();if(!reader)return json({error:"command body required"},400);
          const chunks:Uint8Array[]=[];let size=0;
          for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>64*1024){await reader.cancel();return json({error:"request too large"},413);}chunks.push(next.value);}
          const body=Buffer.concat(chunks).toString("utf8");
          const command=JSON.parse(body);if(!command||typeof command!=="object"||Array.isArray(command))return json({error:"command must be an object"},400);
					return json(await hooks.command(command));
				}
				return json({ error: "not found" }, 404);
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, 500);
			}
		},
	});
  const instance={protocol:1 as const,instanceId,pid:process.pid,port:server.port!,token,startedAt:new Date().toISOString(),
    name:hooks.identity?.name??"Pixi native demo",build:hooks.identity?.build??"development",isolated:hooks.identity?.isolated??false};
  identity=publicInstance(instance);
  let unregister:()=>Promise<void>=async()=>{};
  try{unregister=await registerDebugInstance(instance);await Bun.write(discoveryPath,JSON.stringify(instance));}
  catch(error){server.stop(true);await unregister();throw error;}
	console.log(`[AGENT-DEBUG] listening on 127.0.0.1:${server.port}`);
	let stopped = false;
	return {
    identity,
		async stop() {
			if (stopped) return;
			stopped = true;
			server.stop(true);
      await unregister();
      try{const current=JSON.parse(await readFile(discoveryPath,"utf8"));if(current.instanceId===instanceId&&current.token===token)await rm(discoveryPath,{force:true});}
      catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
		},
	};
}
