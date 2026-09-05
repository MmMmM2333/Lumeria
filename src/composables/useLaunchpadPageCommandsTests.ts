import { ref, shallowRef } from "vue";
import {
  chunkIntoPages,
  createLaunchpadLayoutHelpers,
  makePageSize,
} from "../domain/launchpadLayout.js";
import {
  shouldAssertLaunchpadLayout,
  useLaunchpadPageCommands,
  type LaunchpadWarningDialogConfig,
} from "./useLaunchpadPageCommands.js";
import { createLocalization } from "../i18n/localization.js";
import type {
  LaunchpadApp,
  LaunchpadFolder,
  LaunchpadPages,
} from "../domain/launchpadLayout.js";
import type { IconFocus } from "../domain/iconFocus.js";

const localizationText = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" }).text;

const appA: LaunchpadApp = { id: "app-a", type: "app", name: "App A" };
const appB: LaunchpadApp = { id: "app-b", type: "app", name: "App B" };
const appC: LaunchpadApp = { id: "app-c", type: "app", name: "App C" };
const appD: LaunchpadApp = { id: "app-d", type: "app", name: "App D" };
const appE: LaunchpadApp = { id: "app-e", type: "app", name: "App E" };
const folder: LaunchpadFolder = {
  id: "folder-1",
  type: "folder",
  name: "Folder",
  childPages: [[appB]],
};

function readRefValue<T>(source: Readonly<{ value: T }>): T {
  return source.value;
}

function readNumber(read: () => number): number {
  return read();
}

function readList<T>(read: () => readonly T[]): readonly T[] {
  return read();
}

type PageCommandsOverrides = Readonly<{
  focusedIcon?: IconFocus | null;
  folderPageIndex?: number;
  folderPageSize?: number;
  isDragActive?: boolean;
  isFolderClosing?: boolean;
  isHomeRevealSettling?: boolean;
  openFolderId?: string | null;
  pageIndex?: number;
  pages?: LaunchpadPages;
  pageSize?: number;
  renderedFolder?: LaunchpadFolder | null;
  searchPageIndex?: number;
}>;

function createPageCommands(overrides: PageCommandsOverrides = {}) {
  const calls: {
    assertNoDuplicateItemIds: number;
    cancelInputGesture: number;
    clearFocusedIcon: number;
    commitActivePageIndex: number[];
    commitFolderPageIndex: number[];
    commitOpenFolder: (string | null)[];
    commitPageIndex: number[];
    commitSearchPageIndex: number[];
    finishHomeRevealSettleWindow: number;
    openWarningDialog: LaunchpadWarningDialogConfig[];
    rebasePageIndices: number[];
    schedulePageGridMetrics: number;
    scheduledChromePageIndexCommits: Array<() => void>;
  } = {
    assertNoDuplicateItemIds: 0,
    cancelInputGesture: 0,
    clearFocusedIcon: 0,
    commitActivePageIndex: [],
    commitFolderPageIndex: [],
    commitOpenFolder: [],
    commitPageIndex: [],
    commitSearchPageIndex: [],
    finishHomeRevealSettleWindow: 0,
    openWarningDialog: [],
    rebasePageIndices: [],
    schedulePageGridMetrics: 0,
    scheduledChromePageIndexCommits: [],
  };
  const pages = shallowRef<LaunchpadPages>(overrides.pages ?? [[appA, folder], [appC]]);
  const pageIndex = ref(overrides.pageIndex ?? 2);
  const searchPageIndex = ref(overrides.searchPageIndex ?? 1);
  const focusedIcon = ref(overrides.focusedIcon ?? null);
  const folderPageIndex = ref(overrides.folderPageIndex ?? 3);
  const renderedFolder = ref(overrides.renderedFolder ?? null);
  const openFolderId = ref(overrides.openFolderId ?? null);
  const isFolderClosing = ref(Boolean(overrides.isFolderClosing));
  const isHomeRevealSettling = ref(Boolean(overrides.isHomeRevealSettling));
  const pageSize = ref(overrides.pageSize ?? makePageSize(1, 2));
  const folderPageSize = ref(overrides.folderPageSize ?? makePageSize(1, 2));
  const helpers = createLaunchpadLayoutHelpers({
    getPageSize: () => pageSize.value,
    getFolderPageSize: () => folderPageSize.value,
  });

  const commands = useLaunchpadPageCommands({
    assertNoDuplicateItemIds: () => {
      calls.assertNoDuplicateItemIds += 1;
    },
    cancelInputGesture: () => {
      calls.cancelInputGesture += 1;
    },
    chunkIntoPages,
    clonePages: helpers.clonePages,
    clearFocusedIcon: () => {
      calls.clearFocusedIcon += 1;
      focusedIcon.value = null;
    },
    compactPages: helpers.compactPages,
    commitActivePageIndex: (value) => calls.commitActivePageIndex.push(value),
    commitFolderPageIndex: (value) => calls.commitFolderPageIndex.push(value),
    commitOpenFolder: (value) => calls.commitOpenFolder.push(value),
    commitPageIndex: (value) => calls.commitPageIndex.push(value),
    commitPagesState: (next) => { pages.value = next; },
    commitSearchPageIndex: (value) => calls.commitSearchPageIndex.push(value),
    dissolveFolder: helpers.dissolveFolder,
    finishHomeRevealSettleWindow: () => {
      calls.finishHomeRevealSettleWindow += 1;
      isHomeRevealSettling.value = false;
    },
    findFolder: helpers.findFolder,
    flattenTopLevelPages: helpers.flattenTopLevelPages,
    folderPageIndex,
    folderPageSize,
    isFolderClosing,
    isHomeRevealSettling,
    isDragActive: () => Boolean(overrides.isDragActive),
    localizationText,
    openFolderId,
    openWarningDialog: (config) => calls.openWarningDialog.push(config),
    pageIndex,
    pages,
    pageSize,
    rebasePageIndices: (value) => {
      calls.rebasePageIndices.push(value);
      pageIndex.value = value;
    },
    renderedFolder,
    scheduleChromePageIndexCommit: (callback) => calls.scheduledChromePageIndexCommits.push(callback),
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    focusedIcon,
    searchPageIndex,
  });

  return {
    calls,
    commands,
    folderPageIndex,
    folderPageSize,
    isFolderClosing,
    isHomeRevealSettling,
    openFolderId,
    pageIndex,
    pages,
    pageSize,
    renderedFolder,
    searchPageIndex,
  };
}

export function runLaunchpadPageCommandsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad page commands test failed] ${message}`);
  };

  const commit = createPageCommands({ renderedFolder: folder });
  const nextPages = [[appA]];
  commit.commands.commitPages(nextPages);
  assert(readRefValue(commit.pages) === nextPages, "commitPages should store the next pages");
  assert(readNumber(() => commit.calls.assertNoDuplicateItemIds) === 1, "commitPages should assert duplicate ids when not dragging");
  assert(readList(() => commit.calls.commitFolderPageIndex).join(",") === "3", "commitPages should reclamp folder page when a folder is rendered");

  assert(
    shouldAssertLaunchpadLayout() === (import.meta.env?.PROD !== true),
    "layout duplicate assertions should follow the Vite production flag",
  );

  const dragCommit = createPageCommands({ isDragActive: true, renderedFolder: folder });
  dragCommit.commands.commitPages([[appC]]);
  assert(readNumber(() => dragCommit.calls.assertNoDuplicateItemIds) === 0, "drag-active commitPages should skip duplicate assertions");
  assert(readRefValue(dragCommit.pages)[0]?.[0]?.id === "app-c", "drag-active commitPages should still commit pages");

  const chromePage = createPageCommands();
  chromePage.commands.commitChromePageIndex(1);
  assert(readList(() => chromePage.calls.commitActivePageIndex).join(",") === "1", "chrome page dots should commit the active page by default");
  assert(readNumber(() => chromePage.calls.finishHomeRevealSettleWindow) === 0, "normal chrome page dots should not touch home reveal settle");

  const closingChromePage = createPageCommands({ isFolderClosing: true, isHomeRevealSettling: true });
  closingChromePage.commands.commitChromePageIndex(1);
  assert(readNumber(() => closingChromePage.calls.finishHomeRevealSettleWindow) === 1, "closing chrome page dots should finish home reveal settle first");
  assert(readList(() => closingChromePage.calls.commitActivePageIndex).length === 0, "closing chrome page dots should defer the page commit until the next frame");
  assert(readList(() => closingChromePage.calls.scheduledChromePageIndexCommits).length === 1, "closing chrome page dots should schedule a deferred page commit");
  readList(() => closingChromePage.calls.scheduledChromePageIndexCommits)[0]?.();
  assert(readList(() => closingChromePage.calls.commitActivePageIndex).join(",") === "1", "closing chrome page dots should commit after settle has been cleared");

  const settlingChromePage = createPageCommands({ isHomeRevealSettling: true });
  settlingChromePage.commands.commitChromePageIndex(1);
  assert(readNumber(() => settlingChromePage.calls.finishHomeRevealSettleWindow) === 1, "settling chrome page dots should finish home reveal settle even after folder close");
  assert(readList(() => settlingChromePage.calls.commitActivePageIndex).length === 0, "settling chrome page dots should defer the page commit until the next frame");
  assert(readList(() => settlingChromePage.calls.scheduledChromePageIndexCommits).length === 1, "settling chrome page dots should schedule a deferred page commit");
  readList(() => settlingChromePage.calls.scheduledChromePageIndexCommits)[0]?.();
  assert(readList(() => settlingChromePage.calls.commitActivePageIndex).join(",") === "1", "settling chrome page dots should commit after settle has been cleared");

  const rename = createPageCommands();
  rename.commands.renameFolder("folder-1", "");
  assert(readRefValue(rename.pages)[0]?.[1]?.name === "新文件夹", "renameFolder should fall back to the default folder name");
  rename.commands.renameFolder("folder-1", "123456789012345678901234567890123");
  assert(readRefValue(rename.pages)[0]?.[1]?.name.length === 32, "renameFolder should clamp folder names to 32 characters");

  const dissolveTarget: LaunchpadFolder = {
    id: "folder-dissolve",
    type: "folder",
    name: "Work",
    childPages: [[appB, appD]],
  };
  const dissolve = createPageCommands({
    openFolderId: "folder-dissolve",
    pageSize: 3,
    pages: [[appA, dissolveTarget, appC], [appE]],
    focusedIcon: { area: "desktop", folderId: null, id: "folder-dissolve", pageIndex: 0 },
  });
  dissolve.commands.confirmDissolveFolder("folder-dissolve");
  assert(readList(() => dissolve.calls.openWarningDialog).length === 1, "folder dissolve should require confirmation");
  assert(readRefValue(dissolve.pages)[0]?.[1]?.id === "folder-dissolve", "folder dissolve should not mutate layout before confirmation");
  const dissolveDialog = readList(() => dissolve.calls.openWarningDialog)[0];
  assert(dissolveDialog, "folder dissolve dialog should be available after confirmation request");
  assert(dissolveDialog.confirmTone === "danger" && dissolveDialog.confirmAppearance === "outline", "folder dissolve confirmation should use a danger action");
  dissolveDialog.onConfirm();
  assert(readRefValue(dissolve.pages).map((page) => page.map((item) => item.id).join(",")).join("|") === "app-a,app-b,app-d|app-c,app-e", "confirmed folder dissolve should preserve child order and cascade page overflow");
  assert(readNumber(() => dissolve.calls.cancelInputGesture) === 1, "confirmed folder dissolve should cancel the active input gesture");
  assert(readNumber(() => dissolve.calls.clearFocusedIcon) === 1, "confirmed folder dissolve should clear a selection that referenced the removed folder");
  const committedOpenFolders = readList(() => dissolve.calls.commitOpenFolder);
  assert(committedOpenFolders.length === 1 && committedOpenFolders[0] === null, "confirmed folder dissolve should close the dissolved folder");
  assert(readNumber(() => dissolve.calls.schedulePageGridMetrics) === 1, "confirmed folder dissolve should refresh desktop metrics");

  const forceFill = createPageCommands({
    pageSize: 2,
    pages: [[appA], [], [folder, appC]],
  });
  forceFill.commands.forceFillAllPages();
  assert(readRefValue(forceFill.pages).length === 2, "forceFillAllPages should repack top-level items into dense pages");
  assert(readRefValue(forceFill.pages)[0]?.map((item) => item.id).join(",") === "app-a,folder-1", "forceFillAllPages should preserve item order");
  assert(readList(() => forceFill.calls.commitPageIndex).join(",") === "0", "forceFillAllPages should reset desktop page index");
  assert(readList(() => forceFill.calls.commitSearchPageIndex).join(",") === "0", "forceFillAllPages should reset search page index");
  assert(readNumber(() => forceFill.calls.schedulePageGridMetrics) === 1, "forceFillAllPages should refresh page metrics");

  const dragForceFill = createPageCommands({ isDragActive: true, pages: [[appA], [appC]] });
  dragForceFill.commands.forceFillAllPages();
  assert(readRefValue(dragForceFill.pages).length === 2, "drag-active forceFillAllPages should not repack pages");
  assert(readNumber(() => dragForceFill.calls.schedulePageGridMetrics) === 0, "drag-active forceFillAllPages should not refresh metrics");

  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    for(const environment of [{},undefined]){
    Object.defineProperty(globalThis, "window", { configurable: true, value: environment });
    const confirm = createPageCommands({ pageSize: 2, pages: [[appA], [appC]] });
    confirm.commands.confirmForceFillAllPages();
    assert(readList(() => confirm.calls.openWarningDialog).length === 1, "compacting must require confirmation in browser and native hosts");
    assert(readRefValue(confirm.pages).length === 2, "confirmForceFillAllPages should wait for dialog confirmation");
    readList(() => confirm.calls.openWarningDialog)[0]?.onConfirm();
    assert(readRefValue(confirm.pages).length === 1, "confirmForceFillAllPages should force fill after confirmation");
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }

}
