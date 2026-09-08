type Material="none"|"acrylic"|"mica"|"micaAlt";
type Appearance="light"|"dark";
type Options={apply(material:Material,appearance:Appearance):void;visible():boolean;onError(error:unknown):void;schedule?(callback:()=>void,delay:number):()=>void;};

/** Original window supervisor: focus/show recovery followed by guarded 80/180ms settle passes. */
export function createNativeWindowEffects(options:Options){
  let current:{material:Material;appearance:Appearance}={material:"none",appearance:"dark"};
  let generation=0,disposed=false;
  const pending:(()=>void)[]=[];
  const schedule=options.schedule??((callback,delay)=>{const timer=setTimeout(callback,delay);return()=>clearTimeout(timer);});
  const cancel=()=>{generation++;for(const stop of pending.splice(0))stop();};
  const settle=()=>{
    const version=generation;
    if(current.material==="none")return;
    for(const delay of [80,180])pending.push(schedule(()=>{
      if(disposed||version!==generation||current.material==="none"||!options.visible())return;
      try{options.apply(current.material,current.appearance);}catch(error){options.onError(error);}
    },delay));
  };
  return {
    set(material:Material,appearance:Appearance){
      if(disposed)return;
      options.apply(material,appearance);
      cancel();current={material,appearance};settle();
    },
    refresh(){
      if(disposed)return;
      cancel();
      if(current.material==="none"||!options.visible())return;
      try{options.apply(current.material,current.appearance);}catch(error){options.onError(error);}
      settle();
    },
    dispose(){disposed=true;cancel();},
  };
}
