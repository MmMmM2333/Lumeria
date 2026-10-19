import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";

type ShortcutHost = {
  register(accelerator:string,callback:()=>void):boolean;
  unregister(accelerator:string):boolean;
};
export class NativeShortcutError extends Error {
  constructor(readonly operation:"register"|"unregister"|"restore"|"rollback",readonly shortcut:string,options?:ErrorOptions){
    super(`Shortcut ${operation} failed: ${shortcut}`,options);this.name="NativeShortcutError";
  }
}
export function nativeShortcutAccelerator(shortcut:string):string {
  return normalizeMainWindowShortcut(shortcut).split("+").map(token=>{
    if(/^Key[A-Z]$/.test(token))return token.slice(3);
    if(/^Digit[0-9]$/.test(token))return token.slice(5);
    const names:Record<string,string>={control:"Control",alt:"Alt",shift:"Shift",super:"Super",
      ArrowLeft:"Left",ArrowRight:"Right",ArrowUp:"Up",ArrowDown:"Down"};
    return names[token]??token;
  }).join("+");
}

/** Replace registration without losing the previous shortcut on a failed change. */
export function createNativeShortcut(host:ShortcutHost,activate:()=>void){
  let current:string|null=null;
  let suspended=false;
  // Only an inactive configured binding survives settings cancellation/reopening.
  let failure:NativeShortcutError|null=null;
  const unregister=()=>{
    if(current&&!host.unregister(nativeShortcutAccelerator(current)))throw new NativeShortcutError("unregister",current);
  };
  const register=(shortcut:string,operation:"register"|"restore"="register")=>{
    if(!host.register(nativeShortcutAccelerator(shortcut),activate))throw new NativeShortcutError(operation,shortcut);
  };
  return {
    get current(){return current;},
    get active(){return suspended?null:current;},
    get failure(){return failure;},
    apply(value:string|null){
      const next=normalizeMainWindowShortcut(value);
      if(next===current&&!failure)return {ok:true as const,shortcut:current};
      if(suspended){current=next;if(!next)failure=null;return {ok:true as const,shortcut:next};}
      try{
        if(next)register(next);
        try{unregister();}
        catch(error){
          if(next&&!host.unregister(nativeShortcutAccelerator(next))){
            throw new NativeShortcutError("rollback",next,{cause:error});
          }
          throw error;
        }
        current=next;failure=null;
        return {ok:true as const,shortcut:current};
      }catch(error){
        if(!current&&error instanceof NativeShortcutError)failure=error;
        return {ok:false as const,error};
      }
    },
    suspend(){if(suspended)return;unregister();suspended=true;},
    resume(){
      if(!suspended)return;
      try{if(current)register(current,"restore");}
      catch(error){if(error instanceof NativeShortcutError)failure=error;throw error;}
      suspended=false;if(current)failure=null;
    },
    dispose(){if(!suspended)unregister();current=null;failure=null;},
  };
}
