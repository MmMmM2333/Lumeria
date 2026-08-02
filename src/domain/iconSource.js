export function getIconSource(item) {
  return item?.customIconDataUrl || item?.customIconUrl || item?.iconDataUrl || item?.iconUrl || null;
}

export function getDefaultIconSource(item) {
  return item?.iconDataUrl || item?.iconUrl || null;
}

export function applyCachedIconAssetUrlsToApp(app, convertFilePathToAssetUrl) {
  if (!app || typeof convertFilePathToAssetUrl !== "function") return app;
  const iconUrl = app.iconPath ? convertFilePathToAssetUrl(app.iconPath) : null;
  const customIconUrl = app.customIconPath ? convertFilePathToAssetUrl(app.customIconPath) : null;
  if (!iconUrl && !customIconUrl) return app;
  const next = { ...app };
  if (iconUrl) {
    next.iconUrl = iconUrl;
    delete next.iconDataUrl;
  }
  if (customIconUrl) {
    next.customIconUrl = customIconUrl;
    delete next.customIconDataUrl;
  }
  return next;
}

export function applyCachedIconAssetUrlsToPages(sourcePages, convertFilePathToAssetUrl) {
  if (!Array.isArray(sourcePages)) {
    throw new TypeError("applyCachedIconAssetUrlsToPages requires page data");
  }
  if (typeof convertFilePathToAssetUrl !== "function") {
    throw new TypeError("applyCachedIconAssetUrlsToPages requires an asset URL converter");
  }

  function resolveItem(item) {
    if (!item || item.type !== "folder") {
      return applyCachedIconAssetUrlsToApp(item, convertFilePathToAssetUrl);
    }
    const childPages = (item.childPages || []).map((page) =>
      (page || []).filter(Boolean).map(resolveItem)
    );
    return {
      ...item,
      childPages,
      children: childPages.flat().filter(Boolean),
    };
  }

  return sourcePages.map((page) => (page || []).filter(Boolean).map(resolveItem));
}

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
