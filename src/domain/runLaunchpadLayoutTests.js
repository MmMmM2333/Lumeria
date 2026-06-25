import { createLaunchpadLayoutHelpers, makePageSize } from "./launchpadLayout.js";
import { runWindowChromeApiTests } from "../api/windowChromeApiTests.js";
import { runFolderLayoutStylesTests } from "../composables/useFolderLayoutStylesTests.js";
import { runFolderViewportMetricsTests } from "../composables/useFolderViewportMetricsTests.js";
import { runFolderPrewarmTests } from "../composables/useFolderPrewarmTests.js";
import { runLaunchpadDragTests } from "../composables/useLaunchpadDragTests.js";
import { runLaunchpadControllerHelpersTests } from "../composables/useLaunchpadControllerHelpersTests.js";
import { runLaunchpadControllerStateTests } from "../composables/useLaunchpadControllerStateTests.js";
import { runLaunchpadFolderFlowTests } from "../composables/useLaunchpadFolderFlowTests.js";
import { runFolderOpenIconGhostsTests } from "../composables/useFolderOpenIconGhostsTests.js";
import { runLaunchpadIconActivationTests } from "../composables/useLaunchpadIconActivationTests.js";
import { runLaunchpadKeyboardTests } from "../composables/useLaunchpadKeyboardTests.js";
import { runLaunchpadLaunchFlowTests } from "../composables/useLaunchpadLaunchFlowTests.js";
import { runLaunchpadLifecycleTests } from "../composables/useLaunchpadLifecycleTests.js";
import { runLaunchpadAppsTests } from "../composables/useLaunchpadAppsTests.js";
import { runLaunchpadNativeTests } from "../composables/useLaunchpadNativeTests.js";
import { runLaunchpadPageCommandsTests } from "../composables/useLaunchpadPageCommandsTests.js";
import { runLaunchpadSearchTests } from "../composables/useLaunchpadSearchTests.js";
import { runLaunchpadSettingsConfigTests } from "../composables/useLaunchpadSettingsConfigTests.js";
import { runSettingsPanelFlowTests } from "../composables/useSettingsPanelFlowTests.js";
import { runLaunchpadSurfaceInteractionsTests } from "../composables/useLaunchpadSurfaceInteractionsTests.js";
import { runLaunchpadViewStateTests } from "../composables/useLaunchpadViewStateTests.js";
import { runLaunchpadViewAdaptersTests } from "../composables/useLaunchpadViewAdaptersTests.js";
import { runDesktopLayoutDebugSettingsTests } from "../components/backgroundDebug/desktopLayoutDebugSettingsTests.js";
import { runLiveDesktopDiagnosticsTests } from "../components/backgroundDebug/liveDesktopDiagnosticsTests.js";
import { runMotionCaptureProfileModelTests } from "../components/backgroundDebug/motionCaptureProfileModelTests.js";
import { runMotionDebugPanelModelTests } from "../components/backgroundDebug/motionDebugPanelModelTests.js";
import { runMotionDebugWorkspaceModelTests } from "../components/backgroundDebug/motionDebugWorkspaceModelTests.js";
import { runMotionFocusedDebugExportModelTests } from "../components/backgroundDebug/motionFocusedDebugExportModelTests.js";
import { runMotionInspectorModelTests } from "../components/backgroundDebug/motionInspectorModelTests.js";
import { runMotionReplayBookmarkModelTests } from "../components/backgroundDebug/motionReplayBookmarkModelTests.js";
import { runMotionReplayAnomalyModelTests } from "../components/backgroundDebug/motionReplayAnomalyModelTests.js";
import { runMotionReplayViewerModelTests } from "../components/backgroundDebug/motionReplayViewerModelTests.js";
import { runMotionTrackChartModelTests } from "../components/backgroundDebug/motionTrackChartModelTests.js";
import { runMotionLabModelTests } from "../motionLab/motionLabModelTests.js";
import { runBackgroundImageLayoutTests } from "./backgroundImageLayoutTests.js";
import { runLaunchpadDataTests } from "./launchpadDataTests.js";
import { runMainWindowShortcutTests } from "./mainWindowShortcutTests.js";
import { runIconSourceTests } from "./iconSourceTests.js";
import { runLaunchpadHelperTests } from "./launchpadLayoutTests.js";
import { runPageRenderRangeTests } from "../composables/usePageRenderRangeTests.js";
import { runMotionPresetsTests } from "../rendering/pixi/animation/motionPresetsTests.js";
import { runMotionPreferencesTests } from "../rendering/pixi/animation/motionPreferencesTests.js";
import { runMotionDebugOverlayTests } from "../rendering/pixi/animation/motionDebugOverlayTests.js";
import { runMotionDebugReportTests } from "../rendering/pixi/animation/motionDebugReportTests.js";
import { runMotionReplayTraceTests } from "../rendering/pixi/animation/motionReplayTraceTests.js";
import { createMotionRuntimeDebugAdapter } from "../rendering/pixi/animation/motionRuntimeDebugAdapter.dev.js";
import { installMotionRuntimeDebugAdapterFactory } from "../rendering/pixi/animation/motionRuntime.js";
import { runMotionRuntimeTests } from "../rendering/pixi/animation/motionRuntimeTests.js";
import { runMotionTweenTests } from "../rendering/pixi/animation/motionTweenTests.js";
import { runMotionCleanupTests } from "../rendering/pixi/animation/motionCleanupTests.js";
import { runDisplayObjectBoundsTests } from "../rendering/pixi/geometry/displayObjectBoundsTests.js";
import { runGridGeometryTests } from "../rendering/pixi/geometry/gridGeometryTests.js";
import { runRootStageCoordinatesTests } from "../rendering/pixi/geometry/rootStageCoordinatesTests.js";
import { runStageCoordinatesTests } from "../rendering/pixi/geometry/stageCoordinatesTests.js";
import { runIconBoundsRegistryTests } from "../rendering/pixi/geometry/iconBoundsRegistryTests.js";
import { runIconTextureCacheTests } from "../rendering/pixi/assets/iconTextureCacheTests.js";
import { runFolderLayerStateTests } from "../rendering/pixi/folderLayerStateTests.js";
import { runFolderOverlayStateDependenciesTests } from "../rendering/pixi/folderOverlayStateDependenciesTests.js";
import { runPixiHostMetricsTests } from "../rendering/pixi/pixiHostMetricsTests.js";
import { runPixiRenderSchedulerTests } from "../rendering/pixi/pixiRenderSchedulerTests.js";
import { runPixiRenderTriggersTests } from "../rendering/pixi/pixiRenderTriggersTests.js";
import { runIconControlDrawingTests } from "../rendering/pixi/nodes/iconControlDrawingTests.js";
import { runIconFolderHoverStateTests } from "../rendering/pixi/nodes/iconFolderHoverStateTests.js";
import { runIconInteractionGeometryTests } from "../rendering/pixi/nodes/iconInteractionGeometryTests.js";
import { runIconLabelLayoutTests } from "../rendering/pixi/nodes/iconLabelLayoutTests.js";
import { runIconNodeTests } from "../rendering/pixi/nodes/IconNodeTests.js";
import { runIconSelectionFrameTests } from "../rendering/pixi/nodes/iconSelectionFrameTests.js";
import { runFolderThumbDrawingTests } from "../rendering/pixi/nodes/folderThumbDrawingTests.js";
import { runFolderThumbPreviewMotionTests } from "../rendering/pixi/nodes/folderThumbPreviewMotionTests.js";
import { runDragVisibilityTests } from "../rendering/pixi/scene/dragVisibilityTests.js";
import { runDragPreviewLayerTests } from "../rendering/pixi/scene/DragPreviewLayerTests.js";
import { runDragPreviewMotionTests } from "../rendering/pixi/scene/dragPreviewMotionTests.js";
import { runFolderFrameGhostTests } from "../rendering/pixi/scene/folderFrameGhostTests.js";
import { runDesktopRenderPlanTests } from "../rendering/pixi/scene/desktopRenderPlanTests.js";
import { runDesktopLayerTests } from "../rendering/pixi/scene/DesktopLayerTests.js";
import { runDesktopIconSizingTests } from "../rendering/pixi/scene/desktopIconSizingTests.js";
import { runDesktopBoundsRegistrationTests } from "../rendering/pixi/scene/desktopBoundsRegistrationTests.js";
import { runDesktopBoundsTargetsTests } from "../rendering/pixi/scene/desktopBoundsTargetsTests.js";
import { runFolderGhostIconStateTests } from "../rendering/pixi/scene/folderGhostIconStateTests.js";
import { runFolderIconGhostMotionTests } from "../rendering/pixi/scene/folderIconGhostMotionTests.js";
import { runFolderOverlayIconPlanTests } from "../rendering/pixi/scene/folderOverlayIconPlanTests.js";
import { runFolderOverlayRenderPlanTests } from "../rendering/pixi/scene/folderOverlayRenderPlanTests.js";
import { runFolderCloseRaceTests } from "../rendering/pixi/scene/folderCloseRaceTests.js";
import { runFolderClosingGhostControllerTests } from "../rendering/pixi/scene/folderClosingGhostControllerTests.js";
import { runFolderClosingHandoffActivityTests } from "../rendering/pixi/scene/folderClosingHandoffActivityTests.js";
import { runFolderClosingHandoffRetainerTests } from "../rendering/pixi/scene/folderClosingHandoffRetainerTests.js";
import { runFolderClosingPreviewSwapControllerTests } from "../rendering/pixi/scene/folderClosingPreviewSwapControllerTests.js";
import { runFolderOpeningGhostControllerTests } from "../rendering/pixi/scene/folderOpeningGhostControllerTests.js";
import { runFolderOpeningGeometrySnapshotTests } from "../rendering/pixi/scene/folderOpeningGeometrySnapshotTests.js";
import { runFolderHandoffCoordinatorTests } from "../rendering/pixi/scene/folderHandoffCoordinatorTests.js";
import { runFolderVisualCommitQueueTests } from "../rendering/pixi/scene/folderVisualCommitQueueTests.js";
import { runFolderVisualOwnershipRegistryTests } from "../rendering/pixi/scene/folderVisualOwnershipRegistryTests.js";
import { runFolderOverlayLayerTests } from "../rendering/pixi/scene/FolderOverlayLayerTests.js";
import { runSingleStageFolderDomControlsTests } from "../rendering/pixi/scene/singleStageFolderDomControlsTests.js";
import { runFolderOverlayTargetResolverTests } from "../rendering/pixi/scene/folderOverlayTargetResolverTests.js";
import { runFolderOverlayTargetsTests } from "../rendering/pixi/scene/folderOverlayTargetsTests.js";
import { runFolderPreviewSwapMotionTests } from "../rendering/pixi/scene/folderPreviewSwapMotionTests.js";
import { runIconSceneHelpersTests } from "../rendering/pixi/scene/iconSceneHelpersTests.js";
import { runPageTrackMotionTests } from "../rendering/pixi/scene/pageTrackMotionTests.js";
import { runSingleStageDiagnosticsTests } from "../rendering/pixi/scene/singleStageDiagnosticsTests.js";
import { runAcrylicFiltersTests } from "../rendering/pixi/background/acrylicFiltersTests.js";
import { runAcrylicParamsTests } from "../rendering/pixi/background/acrylicParamsTests.js";
import { runAcrylicNoiseTextureTests } from "../rendering/pixi/background/acrylicNoiseTextureTests.js";
import { runAcrylicBackgroundPlanTests } from "../rendering/pixi/background/acrylicBackgroundPlanTests.js";
import { runBackgroundEffectPipelineTests } from "../rendering/pixi/background/backgroundEffectPipelineTests.js";
import { runBackgroundTextureLoaderTests } from "../rendering/pixi/background/backgroundTextureLoaderTests.js";

const state = {
  searchQuery: { value: "" },
  gridRows: { value: 4 },
  gridCols: { value: 6 },
  folderRows: { value: 3 },
  folderCols: { value: 4 },
};

const pageSize = {
  get value() {
    return makePageSize(state.gridRows.value, state.gridCols.value);
  },
};

const folderPageSize = {
  get value() {
    return makePageSize(state.folderRows.value, state.folderCols.value);
  },
};

installMotionRuntimeDebugAdapterFactory(createMotionRuntimeDebugAdapter);

const helpers = createLaunchpadLayoutHelpers({
  getPageSize: () => pageSize.value,
  getFolderPageSize: () => folderPageSize.value,
});

runLaunchpadHelperTests({
  helpers,
  pageSize,
  folderPageSize,
  searchQuery: state.searchQuery,
  gridRows: state.gridRows,
  gridCols: state.gridCols,
});
await runWindowChromeApiTests();
runLaunchpadDataTests();
runMainWindowShortcutTests();
runBackgroundImageLayoutTests();
runIconSourceTests();
await runLaunchpadDragTests();
runLaunchpadControllerHelpersTests();
runLaunchpadControllerStateTests();
runLaunchpadFolderFlowTests();
await runFolderOpenIconGhostsTests();
runLaunchpadIconActivationTests();
runLaunchpadKeyboardTests();
await runLaunchpadLaunchFlowTests();
await runLaunchpadLifecycleTests();
await runLaunchpadAppsTests();
await runLaunchpadNativeTests();
runLaunchpadPageCommandsTests();
runLaunchpadSurfaceInteractionsTests();
runLaunchpadViewStateTests();
runLaunchpadViewAdaptersTests();
runDesktopLayoutDebugSettingsTests();
runLiveDesktopDiagnosticsTests();
runMotionCaptureProfileModelTests();
runMotionDebugPanelModelTests();
runMotionDebugWorkspaceModelTests();
runMotionFocusedDebugExportModelTests();
runMotionInspectorModelTests();
runMotionReplayAnomalyModelTests();
runMotionReplayBookmarkModelTests();
runMotionReplayViewerModelTests();
runMotionTrackChartModelTests();
runMotionLabModelTests();
runFolderLayoutStylesTests();
runFolderViewportMetricsTests();
await runFolderPrewarmTests();
await runLaunchpadSettingsConfigTests();
runSettingsPanelFlowTests();
await runLaunchpadSearchTests();
await runPageRenderRangeTests();
runMotionPresetsTests();
runMotionPreferencesTests();
await runMotionDebugOverlayTests();
runMotionDebugReportTests();
runMotionReplayTraceTests();
runMotionRuntimeTests();
runMotionTweenTests();
runMotionCleanupTests();
runDisplayObjectBoundsTests();
runGridGeometryTests();
runRootStageCoordinatesTests();
runStageCoordinatesTests();
runIconBoundsRegistryTests();
runFolderLayerStateTests();
runFolderOverlayStateDependenciesTests();
runPixiHostMetricsTests();
runPixiRenderSchedulerTests();
runPixiRenderTriggersTests();
await runAcrylicFiltersTests();
runAcrylicParamsTests();
await runAcrylicNoiseTextureTests();
runAcrylicBackgroundPlanTests();
await runBackgroundEffectPipelineTests();
await runBackgroundTextureLoaderTests();
runIconControlDrawingTests();
runIconFolderHoverStateTests();
runIconInteractionGeometryTests();
runIconLabelLayoutTests();
await runIconNodeTests();
runIconSelectionFrameTests();
runFolderThumbDrawingTests();
runFolderThumbPreviewMotionTests();
runDragVisibilityTests();
await runDragPreviewLayerTests();
runDragPreviewMotionTests();
runDesktopRenderPlanTests();
await runDesktopLayerTests();
runDesktopIconSizingTests();
runDesktopBoundsRegistrationTests();
runDesktopBoundsTargetsTests();
await runFolderFrameGhostTests();
runFolderGhostIconStateTests();
runFolderIconGhostMotionTests();
runFolderOverlayIconPlanTests();
runFolderOverlayRenderPlanTests();
runFolderCloseRaceTests();
await runFolderHandoffCoordinatorTests();
runFolderClosingGhostControllerTests();
runFolderClosingHandoffActivityTests();
runFolderClosingHandoffRetainerTests();
runFolderClosingPreviewSwapControllerTests();
runFolderOpeningGeometrySnapshotTests();
runFolderVisualCommitQueueTests();
runFolderVisualOwnershipRegistryTests();
runFolderOpeningGhostControllerTests();
await runFolderOverlayLayerTests();
runSingleStageFolderDomControlsTests();
runFolderOverlayTargetResolverTests();
runFolderOverlayTargetsTests();
runFolderPreviewSwapMotionTests();
runIconSceneHelpersTests();
runPageTrackMotionTests();
runSingleStageDiagnosticsTests();
await runIconTextureCacheTests();

console.info("Launchpad layout helper tests passed");
