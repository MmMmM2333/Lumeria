type IconSourceFields = {
  customIconDataUrl?: string | null;
  customIconPath?: string | null;
  customIconUrl?: string | null;
  iconDataUrl?: string | null;
  iconPath?: string | null;
  iconUrl?: string | null;
};

type FolderLike = {
  type?: unknown;
  childPages?: readonly (readonly object[])[] | null;
};

function asIconSourceFields(item: unknown): IconSourceFields | null {
  return item !== null && typeof item === "object" ? item as IconSourceFields : null;
}

export function getIconSource(item: unknown): string | null {
  const source = asIconSourceFields(item);
  return source?.customIconDataUrl || source?.customIconUrl || source?.iconDataUrl || source?.iconUrl || null;
}

export function getDefaultIconSource(item: unknown): string | null {
  const source = asIconSourceFields(item);
  return source?.iconDataUrl || source?.iconUrl || null;
}

export function applyCachedIconAssetUrlsToApp<T extends object>(
  app: T,
  convertFilePathToAssetUrl: ((filePath: string) => string | null | undefined) | null | undefined,
): T & IconSourceFields {
  if (!app || typeof convertFilePathToAssetUrl !== "function") return app;
  const source = app as T & IconSourceFields;
  const iconUrl = source.iconPath ? convertFilePathToAssetUrl(source.iconPath) : null;
  const customIconUrl = source.customIconPath ? convertFilePathToAssetUrl(source.customIconPath) : null;
  if (!iconUrl && !customIconUrl) return app;
  const next = { ...app } as T & IconSourceFields;
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

export function applyCachedIconAssetUrlsToPages<T extends object>(
  sourcePages: readonly (readonly T[])[],
  convertFilePathToAssetUrl: (filePath: string) => string | null | undefined,
): T[][] {
  if (!Array.isArray(sourcePages)) {
    throw new TypeError("applyCachedIconAssetUrlsToPages requires page data");
  }
  if (typeof convertFilePathToAssetUrl !== "function") {
    throw new TypeError("applyCachedIconAssetUrlsToPages requires an asset URL converter");
  }

  function resolveItem(item: T): T {
    const folder = item as T & FolderLike;
    if (!item || folder.type !== "folder") {
      return applyCachedIconAssetUrlsToApp(item, convertFilePathToAssetUrl);
    }
    const childPages = (folder.childPages || []).map((page) =>
      (page || []).filter(Boolean).map((child) => resolveItem(child as T))
    );
    return {
      ...item,
      childPages,
    } as T;
  }

  return sourcePages.map((page) => (page || []).filter(Boolean).map(resolveItem));
}
