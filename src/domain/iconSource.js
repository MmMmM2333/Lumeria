export function getIconSource(item) {
  return item?.customIconDataUrl || item?.customIconUrl || item?.iconDataUrl || item?.iconUrl || null;
}

export function getDefaultIconSource(item) {
  return item?.iconDataUrl || item?.iconUrl || null;
}

export function isPixiTextureSafeIconSource(source) {
  const value = String(source || "").trim();
  return /^data:image\//i.test(value) || /^blob:/i.test(value);
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
