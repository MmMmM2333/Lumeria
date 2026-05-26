export function getIconSource(item) {
  return item?.customIconDataUrl || item?.iconDataUrl || item?.iconUrl || null;
}

export function getDefaultIconSource(item) {
  return item?.iconDataUrl || item?.iconUrl || null;
}
