import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "node:http";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory=await mkdtemp(join(tmpdir(),"pixi-mcp-test-")),token=crypto.randomUUID(),id=crypto.randomUUID();
const http=createServer(async(req,res)=>{
  if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401).end();return;}
  let result;
  if(req.url==="/identity")result={instanceId:id};
  else if(req.url==="/capabilities")result={protocol:1};
  else{let body="";for await(const chunk of req)body+=chunk;const command=JSON.parse(body);result={action:command.action,selected:true};}
  res.setHeader("content-type","application/json");res.end(JSON.stringify(result));
});
await new Promise(resolve=>http.listen(0,"127.0.0.1",resolve));
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL("./devtools-mcp.mjs",import.meta.url))],env:{...process.env,PIXI_AGENT_DEBUG_DIRECTORY:directory},stderr:"pipe"});
const client=new Client({name:"devtools-test",version:"1.0.0"});
try{
  await writeFile(join(directory,id+".json"),JSON.stringify({protocol:1,instanceId:id,pid:process.pid,port:http.address().port,token,name:"fixture",build:"test",isolated:true,startedAt:new Date().toISOString()}));
  await client.connect(transport);
  const listed=await client.listTools();assert.ok(listed.tools.some(tool=>tool.name==="replay_input"));
  const missing=await client.callTool({name:"runtime_status",arguments:{}});assert.equal(missing.isError,true);
  const instances=await client.callTool({name:"list_instances",arguments:{}});assert.ok(JSON.stringify(instances).includes(id));assert.ok(!JSON.stringify(instances).includes(token));
  await client.callTool({name:"select_instance",arguments:{instanceId:id}});
  const status=await client.callTool({name:"runtime_status",arguments:{}});assert.equal(status.structuredContent.result.action,"status");
  const invalid=await client.callTool({name:"replay_input",arguments:{steps:[{type:"down",delayMs:-1}]}});assert.equal(invalid.isError,true);
  console.log("DevTools MCP stdio integration passed: discovery, selection, token redaction, status and schema rejection");
}finally{await client.close();await transport.close();await new Promise(resolve=>http.close(resolve));await rm(directory,{recursive:true,force:true});}
