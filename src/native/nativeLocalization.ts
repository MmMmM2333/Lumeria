import zh from "../../locales/zh-CN.json";
import en from "../../locales/en-US.json";
let messages: unknown=zh.messages;
export function setNativeLocale(locale:string):void {messages=locale==="en-US"?en.messages:zh.messages;}
export function t(key:string,values:Record<string,string|number>={}):string {
  let value=messages;
  for(const part of key.split("."))value=(value as Record<string,unknown>)?.[part];
  if(typeof value!=="string")throw new Error(`Missing native translation: ${key}`);
  return value.replace(/\{(\w+)\}/g,(_,name:string)=>String(values[name]??`{${name}}`));
}
