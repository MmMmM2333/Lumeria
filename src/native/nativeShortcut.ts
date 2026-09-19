import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";

type ShortcutHost = {
  register(accelerator:string,callback:()=>void):boolean;
  unregister(accelerator:string):boolean;
};
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
  const unregister=()=>{
    if(current&&!host.unregister(nativeShortcutAccelerator(current)))throw new Error("Could not unregister the active shortcut");
  };
  const register=(shortcut:string)=>{
    if(!host.register(nativeShortcutAccelerator(shortcut),activate))throw new Error("Shortcut is unavailable or already registered");
  };
  return {
    get current(){return current;},
    apply(value:string|null){
      const next=normalizeMainWindowShortcut(value);
      if(next===current)return {ok:true as const,shortcut:current};
      if(suspended){current=next;return {ok:true as const,shortcut:next};}
      try{
        if(next)register(next);
        try{unregister();}
        catch(error){
          if(next&&!host.unregister(nativeShortcutAccelerator(next))){
            throw new AggregateError([error,new Error("Could not roll back the new shortcut")],"Shortcut replacement and rollback failed");
          }
          throw error;
        }
        current=next;
        return {ok:true as const,shortcut:current};
      }catch(error){return {ok:false as const,error};}
    },
    suspend(){
      if(suspended)return;
      unregister();suspended=true;
    },
    resume(){
      if(!suspended)return;
      if(current)register(current);
      suspended=false;
    },
    dispose(){if(!suspended)unregister();current=null;},
  };
}
