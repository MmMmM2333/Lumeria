import { ref, shallowRef } from "vue";
import {
  chunkIntoPages,
  createLaunchpadLayoutHelpers,
  makePageSize,
} from "../domain/launchpadLayout.js";
import {
  shouldAssertLaunchpadLayout,
  useLaunchpadPageCommands,
} from "./useLaunchpadPageCommands.js";

const appA = { id: "app-a", type: "app", name: "App A" };
const appB = { id: "app-b", type: "app", name: "App B" };
const appC = { id: "app-c", type: "app", name: "App C" };
const folder = {
  id: "folder-1",
  type: "folder",
  name: "Folder",
  childPages: [[appB]],
  children: [appB],
};

function createPageCommands(overrides = {}) {
  const calls = {
    assertNoDuplicateItemIds: 0,
    cancelLongPress: 0,
    commitActivePageIndex: [],
    commitFolderPageIndex: [],
    commitOpenFolder: [],
    commitPageIndex: [],
    commitSearchPageIndex: [],
    finishHomeRevealSettleWindow: 0,
    openWarningDialog: [],
    schedulePageGridMetrics: 0,
    scheduledChromePageIndexCommits: [],
  };
  const pages = shallowRef(overrides.pages ?? [[appA, folder], [appC]]);
  const pageIndex = ref(overrides.pageIndex ?? 2);
  const searchPageIndex = ref(overrides.searchPageIndex ?? 1);
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
    cancelLongPress: () => {
      calls.cancelLongPress += 1;
    },
    chunkIntoPages,
    clonePages: helpers.clonePages,
    compactPages: helpers.compactPages,
    commitActivePageIndex: (value) => calls.commitActivePageIndex.push(value),
    commitFolderPageIndex: (value) => calls.commitFolderPageIndex.push(value),
    commitOpenFolder: (value) => calls.commitOpenFolder.push(value),
    commitPageIndex: (value) => calls.commitPageIndex.push(value),
    commitSearchPageIndex: (value) => calls.commitSearchPageIndex.push(value),
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
    openFolderId,
    openWarningDialog: (config) => calls.openWarningDialog.push(config),
    pageIndex,
    pages,
    pageSize,
    removeEverywhere: helpers.removeEverywhere,
    renderedFolder,
    scheduleChromePageIndexCommit: (callback) => calls.scheduledChromePageIndexCommits.push(callback),
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
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
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad page commands test failed] ${message}`);
  };

  const commit = createPageCommands({ renderedFolder: folder });
  const nextPages = [[appA]];
  commit.commands.commitPages(nextPages);
  assert(commit.pages.value === nextPages, "commitPages should store the next pages");
  assert(commit.calls.assertNoDuplicateItemIds === 1, "commitPages should assert duplicate ids when not dragging");
  assert(commit.calls.commitFolderPageIndex.join(",") === "3", "commitPages should reclamp folder page when a folder is rendered");

  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert(!shouldAssertLaunchpadLayout(), "layout duplicate assertions should be disabled in production fallback mode");
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }

  const dragCommit = createPageCommands({ isDragActive: true, renderedFolder: folder });
  dragCommit.commands.commitPages([[appC]]);
  assert(dragCommit.calls.assertNoDuplicateItemIds === 0, "drag-active commitPages should skip duplicate assertions");
  assert(dragCommit.pages.value[0][0].id === "app-c", "drag-active commitPages should still commit pages");

  const chromePage = createPageCommands();
  chromePage.commands.commitChromePageIndex(1);
  assert(chromePage.calls.commitActivePageIndex.join(",") === "1", "chrome page dots should commit the active page by default");
  assert(chromePage.calls.finishHomeRevealSettleWindow === 0, "normal chrome page dots should not touch home reveal settle");

  const closingChromePage = createPageCommands({ isFolderClosing: true, isHomeRevealSettling: true });
  closingChromePage.commands.commitChromePageIndex(1);
  assert(closingChromePage.calls.finishHomeRevealSettleWindow === 1, "closing chrome page dots should finish home reveal settle first");
  assert(closingChromePage.calls.commitActivePageIndex.length === 0, "closing chrome page dots should defer the page commit until the next frame");
  assert(closingChromePage.calls.scheduledChromePageIndexCommits.length === 1, "closing chrome page dots should schedule a deferred page commit");
  closingChromePage.calls.scheduledChromePageIndexCommits[0]();
  assert(closingChromePage.calls.commitActivePageIndex.join(",") === "1", "closing chrome page dots should commit after settle has been cleared");

  const settlingChromePage = createPageCommands({ isHomeRevealSettling: true });
  settlingChromePage.commands.commitChromePageIndex(1);
  assert(settlingChromePage.calls.finishHomeRevealSettleWindow === 1, "settling chrome page dots should finish home reveal settle even after folder close");
  assert(settlingChromePage.calls.commitActivePageIndex.length === 0, "settling chrome page dots should defer the page commit until the next frame");
  assert(settlingChromePage.calls.scheduledChromePageIndexCommits.length === 1, "settling chrome page dots should schedule a deferred page commit");
  settlingChromePage.calls.scheduledChromePageIndexCommits[0]();
  assert(settlingChromePage.calls.commitActivePageIndex.join(",") === "1", "settling chrome page dots should commit after settle has been cleared");

  const rename = createPageCommands();
  rename.commands.renameFolder("folder-1", "");
  assert(rename.pages.value[0][1].name === "新文件夹", "renameFolder should fall back to the default folder name");
  rename.commands.renameFolder("folder-1", "123456789012345678901234567890123");
  assert(rename.pages.value[0][1].name.length === 32, "renameFolder should clamp folder names to 32 characters");

  const forceFill = createPageCommands({
    pageSize: 2,
    pages: [[appA], [], [folder, appC]],
  });
  forceFill.commands.forceFillAllPages();
  assert(forceFill.pages.value.length === 2, "forceFillAllPages should repack top-level items into dense pages");
  assert(forceFill.pages.value[0].map((item) => item.id).join(",") === "app-a,folder-1", "forceFillAllPages should preserve item order");
  assert(forceFill.calls.commitPageIndex.join(",") === "0", "forceFillAllPages should reset desktop page index");
  assert(forceFill.calls.commitSearchPageIndex.join(",") === "0", "forceFillAllPages should reset search page index");
  assert(forceFill.calls.schedulePageGridMetrics === 1, "forceFillAllPages should refresh page metrics");

  const dragForceFill = createPageCommands({ isDragActive: true, pages: [[appA], [appC]] });
  dragForceFill.commands.forceFillAllPages();
  assert(dragForceFill.pages.value.length === 2, "drag-active forceFillAllPages should not repack pages");
  assert(dragForceFill.calls.schedulePageGridMetrics === 0, "drag-active forceFillAllPages should not refresh metrics");

  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    const confirm = createPageCommands({ pageSize: 2, pages: [[appA], [appC]] });
    confirm.commands.confirmForceFillAllPages();
    assert(confirm.calls.openWarningDialog.length === 1, "confirmForceFillAllPages should open a warning dialog in a browser");
    assert(confirm.pages.value.length === 2, "confirmForceFillAllPages should wait for dialog confirmation");
    confirm.calls.openWarningDialog[0].onConfirm();
    assert(confirm.pages.value.length === 1, "confirmForceFillAllPages should force fill after confirmation");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  const remove = createPageCommands({ openFolderId: "folder-1" });
  remove.commands.removeAppById("app-b");
  assert(remove.calls.cancelLongPress === 1, "removeAppById should cancel long press before removing");
  assert(remove.pages.value[0].map((item) => item.id).join(",") === "app-a", "removeAppById should remove apps from folders");
  assert(remove.calls.commitOpenFolder.join(",") === "", "removeAppById should close a folder that disappeared");
  assert(remove.calls.commitOpenFolder.length === 1 && remove.calls.commitOpenFolder[0] === null, "removeAppById should pass null when closing a missing folder");
  assert(remove.calls.commitPageIndex.join(",") === "2", "removeAppById should reclamp desktop page index");
  assert(remove.calls.commitSearchPageIndex.join(",") === "1", "removeAppById should reclamp search page index");

  const ignoredRemove = createPageCommands({ isDragActive: true });
  ignoredRemove.commands.removeAppById("app-a");
  assert(ignoredRemove.calls.cancelLongPress === 0, "drag-active removeAppById should be ignored");
  assert(ignoredRemove.pages.value[0][0].id === "app-a", "drag-active removeAppById should not change pages");
}
