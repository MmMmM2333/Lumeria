import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { DebugClient } from "./debug-client.mjs";

const client=new DebugClient();
const server=new McpServer({name:"electrobun-pixi-devtools",version:"0.3.4"});
const selector=z.object({id:z.string().optional(),label:z.string().optional()}).refine(v=>Boolean(v.id)!==Boolean(v.label),"Specify exactly one id or label");
const result=value=>({content:[{type:"text",text:JSON.stringify(value)}],structuredContent:{result:value}});
function tool(name,description,inputSchema,run,readOnlyHint=true){
  server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint,destructiveHint:!readOnlyHint,openWorldHint:false}},async args=>{
    try{return await run(args);}catch(error){return {isError:true,content:[{type:"text",text:error instanceof Error?error.message:String(error)}]};}
  });
}
tool("list_instances","List live local native Pixi applications; credentials are never returned.",{},async()=>result(await client.list()));
tool("select_instance","Bind this MCP session to an explicit live instance.",{instanceId:z.string()},async({instanceId})=>result(await client.select(instanceId)));
tool("capabilities","Read the selected application's supported actions and evidence limitations.",{},async()=>result(await client.request("/capabilities")));
tool("inspect_scene","Inspect scene hierarchy or one node, including effective visibility, text and textures.",{target:selector.optional(),depth:z.number().int().min(0).max(12).optional(),limit:z.number().int().min(1).max(2000).optional(),detail:z.boolean().optional()},async args=>result(await client.command({action:args.detail?"inspect":"tree",...args})));
tool("runtime_status","Read lifecycle, GPU errors, frame counters, input and registered application state.",{},async()=>result(await client.command({action:"status"})));
tool("hit_test","Explain the node receiving input at logical client coordinates.",{x:z.number(),y:z.number()},async args=>result(await client.command({action:"hit-test",...args})));
tool("capture_evidence","Wait for presentation then capture a diagnostic re-render with state and node details; source is explicitly identified.",{target:selector.optional(),nodes:z.array(selector).max(32).optional()},async args=>{
  const proof=await client.command({action:"capture",...args});
  const root=await realpath(join(tmpdir(),"electrobun-pixi-evidence")),path=await realpath(proof.imagePath),rel=relative(root,path);
  if(rel.startsWith("..")||isAbsolute(rel)||!path.endsWith(".png"))throw new Error("Capture artifact is outside the evidence directory");
  if((await stat(path)).size>12*1024*1024)return result(proof);
  const png=await readFile(path);
  return {content:[{type:"text",text:JSON.stringify(proof)},{type:"image",mimeType:"image/png",data:png.toString("base64")}],structuredContent:{result:proof}};
});
const step=z.object({type:z.enum(["down","move","up","cancel","wait","wheel","key"]),target:selector.optional(),x:z.number().optional(),y:z.number().optional(),offsetX:z.number().optional(),offsetY:z.number().optional(),delayMs:z.number().int().min(0).max(10000).optional(),pointerId:z.number().int().min(2).max(255).optional(),modifiers:z.number().int().min(0).max(15).optional(),dx:z.number().optional(),dy:z.number().optional(),keyCode:z.number().int().min(1).max(255).optional(),present:z.boolean().optional()});
tool("replay_input","Execute timed native-event injection, not physical device input. Uses independent touch IDs; held pointers are canceled on failure.",{steps:z.array(step).min(1).max(256)},async args=>result(await client.command({action:"replay",...args})),false);
tool("cancel_operation","Cancel an active replay and release its injected pointers.",{},async()=>result(await client.command({action:"cancel"})),false);
tool("frame_control","Pause/resume presentation or request steps. Business timers freeze only when the application registered a controlled clock.",{action:z.enum(["pause","resume","step"]),frames:z.number().int().min(1).max(120).optional(),milliseconds:z.number().int().min(0).max(10000).optional()},async args=>result(await client.command(args)),false);
tool("wait_for","Wait for a presentation or a selected node to become visible.",{target:selector.optional(),timeoutMs:z.number().int().min(1).max(30000).optional()},async args=>result(await client.command({action:"wait",...args})));
tool("read_events","Read bounded debug events after a sequence cursor, including truncation information.",{since:z.number().int().nonnegative().optional()},async args=>result(await client.command({action:"events",...args})));
tool("watch_node","Arm a bounded presented-frame property trace, then read or remove it. Captures node and registered application state, not video.",{action:z.enum(["watch-start","watch-read","watch-stop"]),target:selector.optional(),id:z.string().optional(),property:z.enum(["effectiveAlpha","visible","renderable"]).optional(),operator:z.enum(["lt","eq"]).optional(),value:z.union([z.number(),z.boolean()]).optional(),afterFrames:z.number().int().min(0).max(60).optional()},async args=>result(await client.command(args)));
tool("inspect_resources","List scene-reachable texture sources and text node count. This is not total GPU memory.",{},async()=>result(await client.command({action:"resources"})));
await server.connect(new StdioServerTransport());
