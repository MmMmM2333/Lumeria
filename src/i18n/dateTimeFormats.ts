/** Date formats shared by browser localization and the native renderer. */
export const datetimeFormats=Object.freeze({
  "zh-CN":{scanTimestamp:{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}},
  "en-US":{scanTimestamp:{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}},
} as const);
