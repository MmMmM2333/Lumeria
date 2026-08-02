import { deepStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ref } from "vue";
import { useLaunchpadApps } from "../composables/useLaunchpadApps.js";
import { useLaunchpadLayout } from "../composables/useLaunchpadLayout.js";
import { useLaunchpadSettings } from "../composables/useLaunchpadSettings.js";
import { useLiveDesktopRuntime } from "../composables/useLiveDesktopRuntime.js";
import { createLaunchpadDocumentCoordinator } from "./launchpadDocumentCoordinator.js";

const layoutV2RoundTripFixture = JSON.parse(
  readFileSync(new URL("../domain/fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8")
);

function createHarness() {
  const layout = useLaunchpadLayout({ seedEnabled: false });
  const liveDesktopRuntime = useLiveDesktopRuntime();
  const settings = useLaunchpadSettings({
    layout,
    liveDesktopSupport: liveDesktopRuntime.support,
    mainWindow: {
      support: ref({ supportsAcrylic: true, supportsMica: true, supportsMicaAlt: true }),
      registerShortcut: async (shortcut) => ({ ok: true, shortcut }),
      setEffectsEnabled: async () => ({ ok: true }),
      setMode: async () => ({ ok: true }),
    },
  });
  const apps = useLaunchpadApps({
    appendAppsToPages: layout.operations.appendAppsToPages,
    cloneItem: layout.operations.cloneItem,
    clonePages: layout.operations.clonePages,
    collectAppsFromPages: layout.operations.collectAppsFromPages,
    commitOpenFolder: () => {},
    commitPages: layout.commitPages,
    commitPagesAfterDeletion: layout.commitPages,
    findFolder: layout.operations.findFolder,
    isDragActive: () => false,
    makeId: layout.operations.makeId,
    openFolderId: ref(null),
    pages: layout.presentation.pages,
    reclampPageIndices: () => {},
    removeEverywhere: layout.operations.removeEverywhere,
    renderedFolder: ref(null),
    schedulePageGridMetrics: () => {},
    shouldUseNativeCatalog: () => false,
  });
  const document = createLaunchpadDocumentCoordinator({
    apps: apps.persistence,
    layout: layout.documentPersistence,
    settings: settings.persistence,
    toAssetUrl: (path) => `asset:///${path}`,
  });
  return { apps, document, layout, settings };
}

export function runLaunchpadDocumentCoordinatorTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad document coordinator test failed] ${message}`);
  };

  {
    const { document } = createHarness();
    const savedDocument = structuredClone(layoutV2RoundTripFixture);
    const configurationOutcome = document.restoreConfiguration(savedDocument);
    const pagesOutcome = document.restorePages(savedDocument, []);
    assert(configurationOutcome.kind === "configurationRestored", "configuration restore should return an explicit outcome");
    assert(pagesOutcome.kind === "pagesRestored", "page restore should return an explicit outcome");
    deepStrictEqual(
      JSON.parse(JSON.stringify(document.capture())),
      layoutV2RoundTripFixture,
      "the coordinator should preserve the complete version-2 document across restore/capture"
    );
    assert(document.signature() === JSON.stringify(document.capture()), "signature should describe the current captured document without storing a second copy");
  }

  {
    const { apps, document, layout } = createHarness();
    apps.persistence.restore({ hiddenAppIds: ["catalog-hidden"] });
    const outcome = document.createFromCatalog([
      {
        id: "catalog-visible",
        type: "app",
        name: "Visible",
        iconPath: "C:/Icons/visible.png",
        iconDataUrl: "data:image/png;base64,stale",
        launchTarget: { kind: "executable", path: "C:/Apps/Visible.exe" },
      },
      {
        id: "catalog-hidden",
        type: "app",
        name: "Hidden",
        launchTarget: { kind: "executable", path: "C:/Apps/Hidden.exe" },
      },
    ]);

    assert(outcome.kind === "createdFromCatalog", "catalog initialization should return an explicit outcome");
    assert(layout.presentation.pages.value.flat().length === 1, "catalog initialization should honor Apps-owned hidden ids");
    assert(layout.presentation.pages.value[0][0].id === "catalog-visible", "catalog initialization should restore the visible catalog app");
    assert(layout.presentation.pages.value[0][0].iconUrl === "asset:///C:/Icons/visible.png", "runtime pages should resolve cached icon paths through the injected asset capability");
    assert(!("iconDataUrl" in layout.presentation.pages.value[0][0]), "resolved cached icons should discard stale base64 runtime data");
    assert(document.capture().pages[0][0].type === "catalogApp", "captured catalog apps should persist as references");
    assert(!("iconPath" in document.capture().pages[0][0]), "catalog references should not persist scanned icon paths");
    assert(!("launchTarget" in document.capture().pages[0][0]), "catalog references should not persist scanned launch data");
  }

  {
    const { document } = createHarness();
    let error = null;
    try {
      document.restoreConfiguration(null);
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof TypeError, "invalid saved documents should fail explicitly");
  }
}
