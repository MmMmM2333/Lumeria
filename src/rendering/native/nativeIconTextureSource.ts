type NativeIconTextureItem = Readonly<{
  customIconDataUrl?: string | null;
  customIconPath?: string | null;
  customIconUrl?: string | null;
  iconDataUrl?: string | null;
  iconPath?: string | null;
  iconUrl?: string | null;
}>;

export function isNativeFileIconSource(source: unknown): boolean {
  const value = String(source || "").trim();
  if (/^[a-z]:[\\/]/i.test(value) || /^\\\\[^\\]/.test(value)) return true;
  try {
    return new URL(value).protocol === "file:";
  } catch {
    return false;
  }
}

function isNativeImageSource(source: unknown): boolean {
  return /^data:image\//i.test(String(source || "").trim()) || isNativeFileIconSource(source);
}

export function getNativeIconTextureSource(
  item: NativeIconTextureItem | null | undefined,
): string | null {
  const candidates = [
    item?.customIconPath,
    item?.customIconUrl,
    item?.customIconDataUrl,
    item?.iconPath,
    item?.iconUrl,
    item?.iconDataUrl,
  ];
  return candidates.find(isNativeImageSource) || null;
}
