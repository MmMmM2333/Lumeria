/** One bounded sample per show request; diagnostic builds only. */
export function createNativeResumeTiming(report:(sample:unknown)=>void,now=()=>performance.now()){
  let id=0,current:{id:number;start:number;context:unknown;marks:Record<string,number>;spans:Record<string,number>}|null=null;
  let latest:unknown=null;
  return {
    begin(context:unknown){current={id:++id,start:now(),context,marks:{},spans:{}};},
    measure<T>(name:string,run:()=>T):T{const sample=current,start=now();try{return run();}finally{if(sample&&sample===current)sample.spans[name]=(sample.spans[name]??0)+now()-start;}},
    mark(name:string){if(current&&current.marks[name]===undefined)current.marks[name]=now()-current.start;},
    presented(){if(!current)return;latest={...current,totalMs:now()-current.start};current=null;report(latest);},
    snapshot(){return latest;},
    cancel(){current=null;},
  };
}
