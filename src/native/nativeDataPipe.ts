import { createConnection, type Socket } from "node:net";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { NATIVE_DATA_PROTOCOL_VERSION, readNativeResponse } from "./nativeDataProtocol.js";

/** Single-client, owner-restricted pipe created by the launcher's data child. */
export class NativeDataPipe {
  #closed=false;
  #id=0;
  #tail:Promise<void>=Promise.resolve();
  #socket:Socket|null=null;
  readonly #connection:ReturnType<NativeDataPipe["connect"]>;
  constructor(path:string){
    if(!/^\\\\\.\\pipe\\lumeria-data-\d+-[a-f0-9]{32}$/.test(path))throw new Error("Invalid launcher data pipe");
    this.#connection=this.connect(path);void this.#connection.catch(()=>{});
  }
  private async connect(path:string){
    const deadline=Date.now()+10_000;
    while(Date.now()<deadline){
      const socket=createConnection(path);this.#socket=socket;
      // Observe errors before connecting and retain them for subsequent writes.
      let failure:Error|null=null;socket.on("error",error=>{failure=error;});
      try{await once(socket,"connect");}
      catch(error){socket.destroy();if(Date.now()<deadline&&["ENOENT","ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code??"")){await new Promise(resolve=>setTimeout(resolve,10));continue;}throw error;}
      const reader=createInterface({input:socket,crlfDelay:Infinity});
      return {socket,reader,lines:reader[Symbol.asyncIterator](),error:()=>failure};
    }
    throw new Error("Native data pipe connection timed out");
  }
  request(operation:string,fields:Record<string,unknown>={}):Promise<unknown>{
    if(this.#closed)return Promise.reject(new Error("Native data pipe is disposed"));
    const id=++this.#id;
    const task=this.#tail.then(async()=>{
      const channel=await this.#connection;
      if(channel.error())throw channel.error();
      if(channel.socket.destroyed)throw new Error("Native data pipe disconnected");
      await new Promise<void>((resolve,reject)=>channel.socket.write(JSON.stringify({version:NATIVE_DATA_PROTOCOL_VERSION,id,operation,...fields})+"\n",error=>error?reject(error):resolve()));
      const line=await channel.lines.next();
      if(line.done)throw channel.error()??new Error(`Native data pipe ended during ${operation}`);
      return readNativeResponse(line.value,operation,id);
    });
    this.#tail=task.then(()=>{},()=>{});return task;
  }
  async dispose():Promise<void>{
    if(this.#closed)return;this.#closed=true;await this.#tail;
    const channel=await this.#connection.catch(()=>null);
    if(channel){channel.reader.close();channel.socket.end();channel.socket.destroy();}
    else this.#socket?.destroy();
  }
}
