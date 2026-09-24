import type {
  LaunchpadApp,
  LaunchpadFolder,
  LaunchpadItem,
  LaunchpadPages,
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadItem,
  ReadonlyLaunchpadPages,
} from "./launchpadLayout.js";
import { cloneLaunchpadApp as cloneApp } from "./launchpadClone.js";
import type { GroupTransferItem } from "./groupTransferSourceCapture.js";

export type GroupTransferDesktopLocation = Readonly<{
  index: number;
  kind: "desktop";
  pageIndex: number;
}>;

export type GroupTransferFolderLocation = Readonly<{
  flatIndex: number;
  folderId: string;
  folderPageIndex: number;
  index: number;
  kind: "folder";
  ownerIndex: number;
  ownerPageIndex: number;
}>;

export type GroupTransferLocation = GroupTransferDesktopLocation | GroupTransferFolderLocation;

type IndexedDesktopLocation = GroupTransferDesktopLocation & Readonly<{
  item: GroupTransferItem;
  sourceOrder: number;
}>;

type IndexedFolderLocation = GroupTransferFolderLocation & Readonly<{
  item: GroupTransferItem;
  sourceOrder: number;
}>;

type IndexedLocation = IndexedDesktopLocation | IndexedFolderLocation;
type UnindexedLocation =
  | Omit<IndexedDesktopLocation, "sourceOrder">
  | Omit<IndexedFolderLocation, "sourceOrder">;

export type GroupTransferEffects = {
  affectedFolderIds: string[];
  createdFolderId: string | null;
  emptiedFolderIds: string[];
  finalDesktopPageIndex: number | null;
  finalFolderPageIndex: number | null;
  finalOpenFolderId: string | null;
  folderCreateTargetId: string | null;
};

export type GroupTransferMember = Readonly<{
  destination: GroupTransferLocation;
  id: string;
  item: GroupTransferItem;
  role: "folder-create-target" | "selected";
  selected: boolean;
  source: GroupTransferLocation;
  sourceOrder: number;
}>;

export type GroupTransferAcceptedPlan = Readonly<{
  effects: GroupTransferEffects;
  members: GroupTransferMember[];
  nextPages: LaunchpadPages;
  orderedSelectedIds: string[];
  reason: "same-placement" | null;
  status: "accepted" | "noop";
}>;

export type GroupTransferRejectedPlan = Readonly<{
  effects: GroupTransferEffects;
  members: GroupTransferMember[];
  nextPages: null;
  orderedSelectedIds: string[];
  reason: string;
  status: "rejected";
}>;

export type GroupTransferPlan = GroupTransferAcceptedPlan | GroupTransferRejectedPlan;

export type GroupTransferPlanOptions = Readonly<{
  basePages?: ReadonlyLaunchpadPages;
  baseRevision?: unknown;
  currentRevision?: unknown;
  folderName?: unknown;
  folderPageSize?: unknown;
  intent?: Readonly<Record<string, unknown>> | null;
  leadId?: unknown;
  makeFolderId?: (() => unknown) | null;
  pageSize?: unknown;
  selectedIds?: readonly unknown[];
}>;

type NormalizedIntent =
  | Readonly<{ index: number; pageIndex: number; type: "desktop-slot" }>
  | Readonly<{ folderId: string; folderPageIndex: number; index: number; type: "folder-slot" }>
  | Readonly<{ folderId: string; type: "folder-thumbnail" }>
  | Readonly<{ targetAppId: string; type: "application" }>
  | Readonly<{ anchorId: string; destination?: Readonly<{ pageIndex: number; index: number }>; type: "toolbar-folder-create" }>
  | Readonly<{ reason: string; type: "invalid" }>;

type MemberDescriptor = Readonly<{
  id: string;
  item: GroupTransferItem;
  role: "folder-create-target" | "selected";
  selected: boolean;
  sourceLocation: IndexedLocation;
}>;

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeIndex(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeIds(ids: readonly unknown[] | undefined): string[] {
  return Array.from(new Set(
    (ids || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));
}

function getFolderPages(
  folder: ReadonlyLaunchpadItem,
  _folderPageSize: number,
): LaunchpadApp[][] {
  if (folder.type !== "folder") return [[]];
  const pages = folder.childPages.map((page) => (
    page.flatMap((item) => (item ? [cloneApp(item)] : []))
  ));
  return pages.length ? pages : [[]];
}

function withFolderPages(
  folder: ReadonlyLaunchpadFolder,
  pages: readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[],
  options: Readonly<{ folderPageSize?: number; keepEmptyPages?: boolean }> = {},
): LaunchpadFolder {
  let childPages: LaunchpadApp[][] = (pages || []).map((page) => (
    (page || []).flatMap((item) => (item ? [cloneApp(item)] : []))
  ));
  if (options.keepEmptyPages !== true) childPages = childPages.filter((page) => page.length > 0);
  if (!childPages.length) childPages = [[]];
  return {
    ...folder,
    childPages,
  };
}

function cloneItem(item: ReadonlyLaunchpadApp, folderPageSize: number): LaunchpadApp;
function cloneItem(item: ReadonlyLaunchpadFolder, folderPageSize: number): LaunchpadFolder;
function cloneItem(item: ReadonlyLaunchpadItem, folderPageSize: number): LaunchpadItem;
function cloneItem(item: null | undefined, folderPageSize: number): null;
function cloneItem(
  item: ReadonlyLaunchpadItem | null | undefined,
  folderPageSize: number,
): LaunchpadItem | null {
  if (!item) return null;
  if (item.type !== "folder") return cloneApp(item);
  return withFolderPages(
    { ...item },
    getFolderPages(item, folderPageSize),
    { folderPageSize, keepEmptyPages: true }
  );
}

function clonePages(
  pages: ReadonlyLaunchpadPages | undefined,
  folderPageSize: number,
): LaunchpadPages {
  const cloned = (pages || []).map((page) => (
    (page || []).map((item) => cloneItem(item, folderPageSize))
  ));
  return cloned.length ? cloned : [[]];
}

function sourceOf(location: IndexedLocation): GroupTransferLocation {
  if (location.kind === "desktop") {
    return {
      index: location.index,
      kind: "desktop",
      pageIndex: location.pageIndex,
    };
  }
  return {
    flatIndex: location.flatIndex,
    folderId: location.folderId,
    folderPageIndex: location.folderPageIndex,
    index: location.index,
    kind: "folder",
    ownerIndex: location.ownerIndex,
    ownerPageIndex: location.ownerPageIndex,
  };
}

function indexLayout(pages: ReadonlyLaunchpadPages, folderPageSize: number) {
  const duplicates = new Set<string>();
  const folders = new Map<string, IndexedDesktopLocation>();
  const items = new Map<string, IndexedLocation>();
  let sourceOrder = 0;
  const register = (id: string, location: UnindexedLocation) => {
    if (items.has(id)) duplicates.add(id);
    const indexedLocation: IndexedLocation = location.kind === "desktop"
      ? { ...location, sourceOrder }
      : { ...location, sourceOrder };
    items.set(id, indexedLocation);
    sourceOrder += 1;
  };

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!page) continue;
    for (let index = 0; index < page.length; index += 1) {
      const item = page[index];
      if (!item?.id) continue;
      const desktopLocation: Omit<IndexedDesktopLocation, "sourceOrder"> = {
        index,
        item,
        kind: "desktop",
        pageIndex,
      };
      register(item.id, desktopLocation);
      if (item.type !== "folder") continue;
      folders.set(item.id, { ...desktopLocation, sourceOrder: items.get(item.id)!.sourceOrder });
      const childPages = getFolderPages(item, folderPageSize);
      let flatIndex = 0;
      for (let folderPageIndex = 0; folderPageIndex < childPages.length; folderPageIndex += 1) {
        const childPage = childPages[folderPageIndex];
        if (!childPage) continue;
        for (let childIndex = 0; childIndex < childPage.length; childIndex += 1) {
          const child = childPage[childIndex];
          if (!child?.id) continue;
          register(child.id, {
            flatIndex,
            folderId: item.id,
            folderPageIndex,
            index: childIndex,
            item: child,
            kind: "folder",
            ownerIndex: index,
            ownerPageIndex: pageIndex,
          });
          flatIndex += 1;
        }
      }
    }
  }
  return { duplicates: [...duplicates], folders, items };
}

function compactIndexedPages<T>(
  pages: T[][],
  preservedIndex: number | null = null,
): { pageMap: Map<number, number>; pages: T[][] } {
  const nextPages: T[][] = [];
  const pageMap = new Map<number, number>();
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] || [];
    if (!page.length && index !== preservedIndex) continue;
    pageMap.set(index, nextPages.length);
    nextPages.push(page);
  }
  if (!nextPages.length) {
    nextPages.push([]);
    if (preservedIndex === 0) pageMap.set(0, 0);
  }
  return { pageMap, pages: nextPages };
}

function removeSelectedItems(
  basePages: LaunchpadPages,
  selectedIds: ReadonlySet<string>,
  folderPageSize: number,
  options: Readonly<{
    preserveDesktopPageIndex?: number | null;
    preserveFolderIds?: ReadonlySet<string>;
    preserveFolderPage?: Readonly<{ folderId: string; folderPageIndex: number }> | null;
  }> = {},
) {
  const affectedFolderIds = new Set<string>();
  const emptiedFolderIds: string[] = [];
  const folderPageMaps = new Map<string, Map<number, number>>();
  const removedPages: LaunchpadPages = basePages.map((page) => (
    page.flatMap<LaunchpadItem>((item): LaunchpadItem[] => {
    if (selectedIds.has(item.id)) return [];
    if (item.type !== "folder") return [cloneApp(item)];

    const originalPages = getFolderPages(item, folderPageSize);
    let changed = false;
    const childPages: LaunchpadApp[][] = originalPages.map((folderPage) => (
      folderPage.flatMap<LaunchpadApp>((child): LaunchpadApp[] => {
      if (!selectedIds.has(child.id)) return [cloneApp(child)];
      changed = true;
      return [];
      })
    ));
    if (!changed) return [cloneItem(item, folderPageSize)];

    affectedFolderIds.add(item.id);
    const preservedPageIndex = options.preserveFolderPage?.folderId === item.id
      ? options.preserveFolderPage.folderPageIndex
      : null;
    const compacted = compactIndexedPages(childPages, preservedPageIndex);
    folderPageMaps.set(item.id, compacted.pageMap);
    const remainingCount = compacted.pages.reduce((count, folderPage) => count + folderPage.length, 0);
    if (!remainingCount && !options.preserveFolderIds?.has(item.id)) {
      emptiedFolderIds.push(item.id);
      return [];
    }
    return [withFolderPages(item, compacted.pages, {
      folderPageSize,
      keepEmptyPages: preservedPageIndex != null,
    })];
    })
  ));
  const compacted = compactIndexedPages(removedPages, options.preserveDesktopPageIndex ?? null);
  return {
    affectedFolderIds,
    desktopPageMap: compacted.pageMap,
    emptiedFolderIds,
    folderPageMaps,
    pages: compacted.pages,
  };
}

function ensurePage(pages: LaunchpadPages, pageIndex: number): void {
  while (pages.length <= pageIndex) pages.push([]);
}

function cascadePages(pages: LaunchpadPages, startPageIndex: number, pageSize: number): void {
  for (let pageIndex = startPageIndex; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!page || page.length <= pageSize) continue;
    const overflow = page.splice(pageSize);
    ensurePage(pages, pageIndex + 1);
    pages[pageIndex + 1]!.unshift(...overflow);
  }
}

function findTopLevel(pages: ReadonlyLaunchpadPages, id: string) {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!page) continue;
    const index = page.findIndex((item) => item?.id === id);
    if (index >= 0) return { index, item: page[index]!, pageIndex };
  }
  return null;
}

function requireAppItem(item: ReadonlyLaunchpadItem): ReadonlyLaunchpadApp {
  if (item.type !== "app") {
    throw new TypeError(`Group transfer folder child ${item.id} must be an app`);
  }
  return item;
}

function makeFolderItem({
  children,
  folderId,
  folderName,
  folderPageSize,
}: Readonly<{
  children: readonly ReadonlyLaunchpadApp[];
  folderId: string;
  folderName: string;
  folderPageSize: number;
}>): LaunchpadFolder {
  const childPages: LaunchpadApp[][] = [];
  for (let index = 0; index < children.length; index += folderPageSize) {
    childPages.push(children.slice(index, index + folderPageSize).map(cloneApp));
  }
  return withFolderPages({
    childPages: [],
    id: folderId,
    name: folderName,
    type: "folder",
  }, childPages, { folderPageSize });
}

function layoutSignature(
  pages: ReadonlyLaunchpadPages,
  folderPageSize: number,
): string {
  return JSON.stringify((pages || []).map((page) => page.map((item) => (
    item.type === "folder"
      ? [item.id, "folder", getFolderPages(item, folderPageSize).map((folderPage) => folderPage.map((child) => child.id))]
      : [item.id, "app"]
  ))));
}

function makeEmptyEffects(): GroupTransferEffects {
  return {
    affectedFolderIds: [],
    createdFolderId: null,
    emptiedFolderIds: [],
    finalDesktopPageIndex: null,
    finalFolderPageIndex: null,
    finalOpenFolderId: null,
    folderCreateTargetId: null,
  };
}

function rejected(
  reason: string,
  details: Readonly<{
    effects?: Partial<GroupTransferEffects>;
    members?: GroupTransferMember[];
    orderedSelectedIds?: string[];
  }> = {},
): GroupTransferRejectedPlan {
  return {
    effects: { ...makeEmptyEffects(), ...(details.effects || {}) },
    members: details.members || [],
    nextPages: null,
    orderedSelectedIds: details.orderedSelectedIds || [],
    reason,
    status: "rejected",
  };
}

function adjustedTopLevelIndex(
  basePage: readonly ReadonlyLaunchpadItem[],
  originalIndex: number,
  removedIds: ReadonlySet<string>,
  emptiedFolderIds: readonly string[],
): number {
  const emptied = new Set(emptiedFolderIds);
  let index = 0;
  for (let current = 0; current < originalIndex; current += 1) {
    const item = basePage[current];
    if (!item || removedIds.has(item.id) || emptied.has(item.id)) continue;
    index += 1;
  }
  return index;
}

function destinationMembers(
  memberDescriptors: readonly MemberDescriptor[],
  nextPages: LaunchpadPages,
  folderPageSize: number,
): GroupTransferMember[] {
  const finalIndex = indexLayout(nextPages, folderPageSize);
  return memberDescriptors.map((descriptor) => {
    const destination = finalIndex.items.get(descriptor.id);
    if (!destination) throw new Error(`Group transfer planner lost member: ${descriptor.id}`);
    return {
      destination: sourceOf(destination),
      id: descriptor.id,
      item: cloneItem(descriptor.item, folderPageSize),
      role: descriptor.role,
      selected: descriptor.selected,
      source: sourceOf(descriptor.sourceLocation),
      sourceOrder: descriptor.sourceLocation.sourceOrder,
    };
  });
}

function normalizeIntent(intent: Readonly<Record<string, unknown>> | null | undefined): NormalizedIntent {
  const source = intent || {};
  const type = String(source.type || "invalid");
  if (type === "desktop-slot") {
    return { index: normalizeIndex(source.index), pageIndex: normalizeIndex(source.pageIndex), type };
  }
  if (type === "folder-slot") {
    return {
      folderId: String(source.folderId || "").trim(),
      folderPageIndex: normalizeIndex(source.folderPageIndex),
      index: normalizeIndex(source.index),
      type,
    };
  }
  if (type === "folder-thumbnail") {
    return { folderId: String(source.folderId || "").trim(), type };
  }
  if (type === "application") {
    return { targetAppId: String(source.targetAppId || "").trim(), type };
  }
  if (type === "toolbar-folder-create") {
    const destination = source.destination as { pageIndex?: unknown; index?: unknown } | undefined;
    return { anchorId: String(source.anchorId || "").trim(), type,
      ...(destination ? { destination: { pageIndex: normalizeIndex(destination.pageIndex), index: normalizeIndex(destination.index) } } : {}) };
  }
  return { reason: String(source.reason || "invalid-target"), type: "invalid" };
}

export function planGroupTransfer(options: GroupTransferPlanOptions = {}): GroupTransferPlan {
  const folderPageSize = normalizePositiveInteger(options.folderPageSize, 1);
  const pageSize = normalizePositiveInteger(options.pageSize, 1);
  const basePages = clonePages(options.basePages, folderPageSize);
  const selectedIds = normalizeIds(options.selectedIds);
  const intent = normalizeIntent(options.intent);

  if (options.baseRevision !== options.currentRevision) return rejected("revision-stale");
  if (!selectedIds.length) return rejected("invalid-selection");

  const baseIndex = indexLayout(basePages, folderPageSize);
  if (baseIndex.duplicates.length) return rejected("duplicate-layout-id");
  if (selectedIds.some((id) => !baseIndex.items.has(id))) return rejected("missing-selected-id");

  const selectedLocations = selectedIds
    .map((id) => baseIndex.items.get(id)!)
    .sort((left, right) => left.sourceOrder - right.sourceOrder);
  const orderedSelectedIds = selectedLocations.map((location) => location.item.id);
  const leadId = String(options.leadId || orderedSelectedIds[0] || "").trim();
  if (!leadId || !selectedIds.includes(leadId)) {
    return rejected("invalid-lead", { orderedSelectedIds });
  }
  const selectedFolderCount = selectedLocations.filter((location) => location.item.type === "folder").length;
  if (selectedFolderCount && (selectedLocations.length !== 1 || intent.type !== "desktop-slot")) {
    return rejected("folder-drag-intent", { orderedSelectedIds });
  }
  if (intent.type === "invalid") return rejected(intent.reason, { orderedSelectedIds });
  if (
    selectedLocations.some((location) => location.item.type !== "app") &&
    intent.type !== "desktop-slot"
  ) {
    return rejected("folder-drag-intent", { orderedSelectedIds });
  }

  const selectedSet = new Set<string>(orderedSelectedIds);
  const preserveFolderIds = new Set<string>();
  let preserveFolderPage: { folderId: string; folderPageIndex: number } | null = null;
  let preserveDesktopPageIndex: number | null = null;
  let toolbarAnchor: IndexedLocation | null = null;

  if (intent.type === "desktop-slot") {
    if (intent.pageIndex > basePages.length) return rejected("desktop-page-missing", { orderedSelectedIds });
    if (intent.pageIndex < basePages.length) preserveDesktopPageIndex = intent.pageIndex;
  } else if (intent.type === "folder-slot") {
    const targetFolder = baseIndex.folders.get(intent.folderId);
    if (!targetFolder) return rejected("folder-missing", { orderedSelectedIds });
    const originalPages = getFolderPages(targetFolder.item, folderPageSize);
    if (intent.folderPageIndex > originalPages.length) {
      return rejected("folder-page-missing", { orderedSelectedIds });
    }
    preserveFolderIds.add(intent.folderId);
    if (intent.folderPageIndex < originalPages.length) {
      preserveFolderPage = { folderId: intent.folderId, folderPageIndex: intent.folderPageIndex };
    }
  } else if (intent.type === "folder-thumbnail") {
    if (!baseIndex.folders.has(intent.folderId)) return rejected("folder-missing", { orderedSelectedIds });
    preserveFolderIds.add(intent.folderId);
  } else if (intent.type === "application") {
    const target = baseIndex.items.get(intent.targetAppId);
    if (!target || target.item.type !== "app") return rejected("target-app-missing", { orderedSelectedIds });
    if (target.kind !== "desktop") return rejected("nested-folder-not-supported", { orderedSelectedIds });
    if (selectedSet.has(intent.targetAppId)) return rejected("target-in-selection", { orderedSelectedIds });
  } else if (intent.type === "toolbar-folder-create") {
    const anchorId = intent.anchorId || orderedSelectedIds[0] || "";
    toolbarAnchor = baseIndex.items.get(anchorId) ?? null;
    if (!toolbarAnchor || !selectedSet.has(anchorId) || toolbarAnchor.item.type !== "app") {
      return rejected("folder-anchor-missing", { orderedSelectedIds });
    }
    if (intent.destination && intent.destination.pageIndex >= basePages.length) return rejected("desktop-page-missing", { orderedSelectedIds });
    preserveDesktopPageIndex = intent.destination?.pageIndex ?? (toolbarAnchor.kind === "desktop"
      ? toolbarAnchor.pageIndex
      : toolbarAnchor.ownerPageIndex);
  }

  const removal = removeSelectedItems(basePages, selectedSet, folderPageSize, {
    preserveDesktopPageIndex,
    preserveFolderIds,
    preserveFolderPage,
  });
  let nextPages = removal.pages;
  const affectedFolderIds = new Set(removal.affectedFolderIds);
  const memberDescriptors: MemberDescriptor[] = selectedLocations.map((
    sourceLocation,
  ): MemberDescriptor => ({
    id: sourceLocation.item.id,
    item: sourceLocation.item,
    role: "selected",
    selected: true,
    sourceLocation,
  }));
  const effects = makeEmptyEffects();
  let folderCreateTargetId: string | null = null;

  if (intent.type === "desktop-slot") {
    let targetPageIndex;
    if (intent.pageIndex === basePages.length) {
      targetPageIndex = nextPages.length;
      ensurePage(nextPages, targetPageIndex);
    } else {
      targetPageIndex = removal.desktopPageMap.get(intent.pageIndex);
      if (targetPageIndex == null) return rejected("desktop-page-missing", { orderedSelectedIds });
    }
    const targetPage = nextPages[targetPageIndex]!;
    const index = Math.min(intent.index, targetPage.length);
    targetPage.splice(
      index,
      0,
      ...selectedLocations.map((location) => cloneItem(location.item, folderPageSize))
    );
    cascadePages(nextPages, targetPageIndex, pageSize);
    effects.finalDesktopPageIndex = targetPageIndex;
  } else if (intent.type === "folder-slot") {
    const target = findTopLevel(nextPages, intent.folderId);
    if (!target || target.item.type !== "folder") return rejected("folder-missing", { orderedSelectedIds });
    const originalTarget = baseIndex.folders.get(intent.folderId)!;
    const originalPages = getFolderPages(originalTarget.item, folderPageSize);
    let folderPages = getFolderPages(target.item, folderPageSize);
    let targetFolderPageIndex;
    if (intent.folderPageIndex === originalPages.length) {
      targetFolderPageIndex = folderPages.length;
      ensurePage(folderPages, targetFolderPageIndex);
    } else {
      targetFolderPageIndex = removal.folderPageMaps.get(intent.folderId)?.get(intent.folderPageIndex);
      if (targetFolderPageIndex == null) {
        targetFolderPageIndex = intent.folderPageIndex;
      }
      ensurePage(folderPages, targetFolderPageIndex);
    }
    const targetFolderPage = folderPages[targetFolderPageIndex]!;
    const index = Math.min(intent.index, targetFolderPage.length);
    targetFolderPage.splice(
      index,
      0,
      ...selectedLocations.map((location) => cloneApp(requireAppItem(location.item)))
    );
    cascadePages(folderPages, targetFolderPageIndex, folderPageSize);
    nextPages[target.pageIndex]![target.index] = withFolderPages(target.item, folderPages, { folderPageSize });
    affectedFolderIds.add(intent.folderId);
    effects.finalDesktopPageIndex = target.pageIndex;
    effects.finalFolderPageIndex = targetFolderPageIndex;
    effects.finalOpenFolderId = intent.folderId;
  } else if (intent.type === "folder-thumbnail") {
    const target = findTopLevel(nextPages, intent.folderId);
    if (!target || target.item.type !== "folder") return rejected("folder-missing", { orderedSelectedIds });
    const folderPages = getFolderPages(target.item, folderPageSize).filter((page) => page.length > 0);
    if (!folderPages.length) folderPages.push([]);
    const targetFolderPageIndex = folderPages.length - 1;
    folderPages[targetFolderPageIndex]!.push(
      ...selectedLocations.map((location) => cloneApp(requireAppItem(location.item)))
    );
    cascadePages(folderPages, targetFolderPageIndex, folderPageSize);
    nextPages[target.pageIndex]![target.index] = withFolderPages(target.item, folderPages, { folderPageSize });
    affectedFolderIds.add(intent.folderId);
    effects.finalDesktopPageIndex = target.pageIndex;
  } else if (intent.type === "application") {
    const target = findTopLevel(nextPages, intent.targetAppId);
    if (!target || target.item.type !== "app") return rejected("target-app-missing", { orderedSelectedIds });
    const folderId = typeof options.makeFolderId === "function"
      ? String(options.makeFolderId() || "").trim()
      : "";
    if (!folderId) return rejected("folder-id-missing", { orderedSelectedIds });
    if (baseIndex.items.has(folderId)) return rejected("folder-id-collision", { orderedSelectedIds });
    const targetSource = baseIndex.items.get(intent.targetAppId)!;
    memberDescriptors.unshift({
      id: targetSource.item.id,
      item: targetSource.item,
      role: "folder-create-target",
      selected: false,
      sourceLocation: targetSource,
    });
    const children = [
      target.item,
      ...selectedLocations.map((location) => requireAppItem(location.item)),
    ];
    nextPages[target.pageIndex]!.splice(target.index, 1, makeFolderItem({
      children,
      folderId,
      folderName: String(options.folderName || "New Folder"),
      folderPageSize,
    }));
    affectedFolderIds.add(folderId);
    effects.createdFolderId = folderId;
    effects.finalDesktopPageIndex = target.pageIndex;
    folderCreateTargetId = intent.targetAppId;
  } else if (intent.type === "toolbar-folder-create") {
    const folderId = typeof options.makeFolderId === "function"
      ? String(options.makeFolderId() || "").trim()
      : "";
    if (!folderId) return rejected("folder-id-missing", { orderedSelectedIds });
    if (baseIndex.items.has(folderId)) return rejected("folder-id-collision", { orderedSelectedIds });
    const anchor = toolbarAnchor!;
    let targetPageIndex: number | undefined;
    let targetIndex: number;
    if (intent.destination) {
      targetPageIndex = removal.desktopPageMap.get(intent.destination.pageIndex);
      targetIndex = adjustedTopLevelIndex(basePages[intent.destination.pageIndex]!, intent.destination.index, selectedSet, removal.emptiedFolderIds);
    } else if (anchor.kind === "desktop") {
      targetPageIndex = removal.desktopPageMap.get(anchor.pageIndex);
      targetIndex = adjustedTopLevelIndex(
        basePages[anchor.pageIndex]!,
        anchor.index,
        selectedSet,
        removal.emptiedFolderIds
      );
    } else {
      const remainingSourceFolder = findTopLevel(nextPages, anchor.folderId);
      if (remainingSourceFolder) {
        targetPageIndex = remainingSourceFolder.pageIndex;
        targetIndex = remainingSourceFolder.index + 1;
      } else {
        targetPageIndex = removal.desktopPageMap.get(anchor.ownerPageIndex);
        targetIndex = adjustedTopLevelIndex(
          basePages[anchor.ownerPageIndex]!,
          anchor.ownerIndex,
          selectedSet,
          removal.emptiedFolderIds
        );
      }
    }
    if (targetPageIndex == null) return rejected("folder-anchor-missing", { orderedSelectedIds });
    nextPages[targetPageIndex]!.splice(targetIndex, 0, makeFolderItem({
      children: selectedLocations.map((location) => requireAppItem(location.item)),
      folderId,
      folderName: String(options.folderName || "New Folder"),
      folderPageSize,
    }));
    cascadePages(nextPages, targetPageIndex, pageSize);
    affectedFolderIds.add(folderId);
    effects.createdFolderId = folderId;
    effects.finalDesktopPageIndex = targetPageIndex;
  }

  const compacted = compactIndexedPages(nextPages).pages;
  nextPages = compacted.map((page) => page.map((item) => (
    item.type === "folder"
      ? withFolderPages(item, getFolderPages(item, folderPageSize), { folderPageSize })
      : cloneApp(item)
  )));
  const finalIndex = indexLayout(nextPages, folderPageSize);
  if (effects.createdFolderId) {
    const created = finalIndex.folders.get(effects.createdFolderId);
    effects.finalDesktopPageIndex = created?.pageIndex ?? effects.finalDesktopPageIndex;
  } else if (intent.type === "folder-thumbnail") {
    effects.finalDesktopPageIndex = finalIndex.folders.get(intent.folderId)?.pageIndex ?? effects.finalDesktopPageIndex;
  } else if (intent.type === "folder-slot") {
    effects.finalDesktopPageIndex = finalIndex.folders.get(intent.folderId)?.pageIndex ?? effects.finalDesktopPageIndex;
  }
  effects.affectedFolderIds = [...affectedFolderIds];
  effects.emptiedFolderIds = [...removal.emptiedFolderIds];
  effects.folderCreateTargetId = folderCreateTargetId;

  const members = destinationMembers(memberDescriptors, nextPages, folderPageSize);
  const status = layoutSignature(nextPages, folderPageSize) === layoutSignature(basePages, folderPageSize)
    ? "noop"
    : "accepted";
  return {
    effects,
    members,
    nextPages,
    orderedSelectedIds,
    reason: status === "noop" ? "same-placement" : null,
    status,
  };
}
