import zh from "../../locales/zh-CN.json";
import en from "../../locales/en-US.json";
import { datetimeFormats } from "../i18n/dateTimeFormats.js";
export const nativeLocaleOptions=[zh,en].map(catalog=>({value:catalog.locale,label:catalog.displayName}));
let messages: unknown=zh.messages;
export function setNativeLocale(locale:string):void {messages=locale==="en-US"?en.messages:zh.messages;}
export function getNativeLocale():"en-US"|"zh-CN"{return messages===en.messages?"en-US":"zh-CN";}
export function formatNativeScanTime(value:string):string {
  const date=new Date(value);if(Number.isNaN(date.getTime()))return value;
  const locale=getNativeLocale();return new Intl.DateTimeFormat(locale,datetimeFormats[locale].scanTimestamp).format(date);
}
export function t(key:string,values:Record<string,string|number>={}):string {
  let value=messages;
  for(const part of key.split("."))value=(value as Record<string,unknown>)?.[part];
  if(typeof value!=="string")throw new Error(`Missing native translation: ${key}`);
  return value.replace(/\{(\w+)\}/g,(_,name:string)=>String(values[name]??`{${name}}`));
}
