const latin=new Intl.Collator("en",{numeric:true,sensitivity:"base"});
const chinese=new Intl.Collator("zh-Hans-CN-u-co-pinyin",{numeric:true,sensitivity:"base"});
const category=(name:string)=>/^\d/u.test(name)?0:/^[a-z]/iu.test(name)?1:/^\p{Script=Han}/u.test(name)?2:3;
/** First-import ordering is independent of the current UI/OS locale. */
export function compareImportNames(a:string,b:string):number{
  const left=a.trim(),right=b.trim(),group=category(left),other=category(right);
  return group-other||(group===2?chinese:latin).compare(left,right)||a.localeCompare(b,"en");
}
