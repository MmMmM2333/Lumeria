import { DebugClient } from "./debug-client.mjs";
const [action="list",instanceId,argument]=process.argv.slice(2),client=new DebugClient();
if(action==="list")console.log(JSON.stringify(await client.list(),null,2));
else{
  if(!instanceId)throw new Error("Usage: devtools-cli <status|capabilities|command> <instanceId> [JSON command]");
  await client.select(instanceId);
  const value=action==="status"?await client.command({action:"status"}):action==="capabilities"?await client.request("/capabilities"):action==="command"?await client.command(JSON.parse(argument)):null;
  if(value===null)throw new Error("Unknown command");console.log(JSON.stringify(value,null,2));
}
