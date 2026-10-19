/** Keep hit-test requests while a pointer session temporarily owns the cursor. */
export function createNativeCursorPolicy(apply:(cursor:string)=>void){
  let requested="default",override:string|null=null,applied:string|null=null;
  const commit=()=>{
    const cursor=override??requested;
    if(cursor===applied)return;
    applied=cursor;apply(cursor);
  };
  return {
    request(cursor:string|null|undefined){requested=cursor||"default";commit();},
    override(cursor:string|null){override=cursor;commit();},
  };
}
