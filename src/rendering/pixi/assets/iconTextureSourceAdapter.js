export function isTauriAssetIconSource(source) {
  const value = String(source || "").trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname === "asset.localhost";
  } catch {
    return false;
  }
}

export function isPixiTextureSafeIconSource(source) {
  const value = String(source || "").trim();
  return /^data:image\//i.test(value) || /^blob:/i.test(value) || isTauriAssetIconSource(value);
}

export function getPixiIconTextureSource(item) {
  const candidates = [
    item?.customIconDataUrl,
    item?.customIconUrl,
    item?.iconDataUrl,
    item?.iconUrl,
  ];
  return candidates.find(isPixiTextureSafeIconSource) || null;
}
