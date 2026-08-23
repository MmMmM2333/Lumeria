import { ref } from "vue";
import {
  useLaunchpadPageNavigation,
  type LaunchpadPageTurnOptions,
} from "./useLaunchpadPageNavigation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Launchpad page navigation test failed] ${message}`);
}

type NavigationOverrides = Readonly<{
  folderPageIndex?: number;
  folderPages?: unknown[][];
  isFolderClosing?: boolean;
  isSearchMode?: boolean;
  openFolderId?: string | null;
  pageIndex?: number;
  pages?: unknown[][];
  renderedFolder?: Readonly<{ id: string }> | null;
  searchPageIndex?: number;
  searchPages?: unknown[][];
  visualFolderPageIndex?: number;
}>;

function createNavigation(overrides: NavigationOverrides = {}) {
  const calls: {
    commitPageIndex: number[];
    commitSearchPageIndex: number[];
    requestFolderPageTurn: Array<{ options: Readonly<{ phase: "open"; source: string }>; pageIndex: number }>;
  } = { commitPageIndex: [], commitSearchPageIndex: [], requestFolderPageTurn: [] };
  const navigation = useLaunchpadPageNavigation({
    commitPageIndex: (pageIndex) => calls.commitPageIndex.push(pageIndex),
    commitSearchPageIndex: (pageIndex) => calls.commitSearchPageIndex.push(pageIndex),
    finishHomeRevealSettleWindow: () => {},
    folderPageIndex: ref(overrides.folderPageIndex ?? 0),
    folderPages: ref(overrides.folderPages ?? [[]]),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(Boolean(overrides.isFolderClosing)),
    isFolderZoomFadeClosing: ref(false),
    isHomeRevealSettling: ref(false),
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    openFolderId: ref(overrides.openFolderId ?? null),
    pageIndex: ref(overrides.pageIndex ?? 0),
    pages: ref(overrides.pages ?? [[]]),
    renderedFolder: ref(overrides.renderedFolder ?? null),
    requestFolderPageTurn: (pageIndex, options) => {
      calls.requestFolderPageTurn.push({ options, pageIndex });
      return pageIndex + 1;
    },
    searchPageIndex: ref(overrides.searchPageIndex ?? 0),
    searchPages: ref(overrides.searchPages ?? [[]]),
    focusFirstIconInCurrentScope: () => {},
    visualFolderPageIndex: ref(overrides.visualFolderPageIndex ?? overrides.folderPageIndex ?? 0),
  });
  return { calls, navigation };
}

export function runLaunchpadPageNavigationTests() {
  const desktop = createNavigation({ pages: [[{}], [{}]] });
  assert(desktop.navigation.turnCurrentPage(1, { source: "keyboard" }) === true, "desktop page navigation should report a valid turn");
  assert(desktop.calls.commitPageIndex.join(",") === "1", "desktop page navigation should commit the adjacent page");

  const folder = createNavigation({
    folderPages: [[{}], [{}]],
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1" },
  });
  folder.navigation.turnCurrentPage(1, { source: "keyboard" });
  assert(folder.calls.requestFolderPageTurn[0]?.pageIndex === 1, "folder page navigation should use the folder visual route");
  assert(folder.calls.commitPageIndex.length === 0, "an open-folder turn should not mutate the desktop page");
}
