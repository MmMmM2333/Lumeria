export function hashDebugSample(value) {
  const text = String(value || "");
  const sample = text.length > 384
    ? `${text.length}:${text.slice(0, 192)}:${text.slice(-192)}`
    : text;
  let hash = 0x811c9dc5;
  for (let index = 0; index < sample.length; index += 1) {
    hash ^= sample.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashDebugBytes(bytes) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function makeDebugSourceSnapshot(source) {
  const value = String(source || "");
  return {
    fingerprint: hashDebugSample(value),
    length: value.length,
    scheme: value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() || "unknown",
  };
}
