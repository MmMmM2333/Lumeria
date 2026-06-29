import { Container, Graphics } from "pixi.js";
import { IconNode } from "../nodes/IconNode.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { drawFolderThumbFrame } from "../nodes/folderThumbDrawing.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motion, parallel } from "../animation/motionTween.js";
import { getFolderCreateReleaseMotion } from "./folderCreateReleaseMotion.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const FOLDER_CREATE_RELEASE_START_REASON = "folder-create-release-start";
const FOLDER_CREATE_RELEASE_CLEAR_REASON = "folder-create-release-clear";

function describeTarget(target, release, phase, part, sourceLabel, overlayTarget = target) {
  if (!target || !release?.folderId) return;
  motionRuntime.describeTarget(target, {
    folderId: release.folderId,
    itemId: release.folderId,
    itemType: "folder",
    kind: "FolderCreateRelease",
    label: release.folderItem?.name || release.folderId,
    layer: "folderCreateRelease",
    overlayTarget,
    phase,
    sourceLabel,
    targetPart: part,
  });
}

function setIconGhostState(node, layout, state = {}) {
  const iconSize = Math.max(1, Number(layout?.iconSize) || Number(state.iconSize) || 1);
  node.stageRect = layout?.stageRect || state.stageRect;
  node.setState({
    cellHeight: iconSize,
    cellWidth: iconSize,
    compact: false,
    draggable: false,
    dropTarget: false,
    editing: false,
    folderPreviewPageSize: state.folderPageSize,
    ghosted: false,
    hasCustomIcon: false,
    iconSize,
    interactive: false,
    item: layout?.item,
    launchTargetStatus: null,
    opening: false,
    preserveNodeScale: true,
    removable: false,
    selected: false,
    singleLineLabel: false,
    source: layout?.sourceKey || { type: "folder-create-ghost" },
    stageHeight: state.height,
    stageWidth: state.width,
    textless: true,
  });
  if (node.labelText) {
    node.labelText.alpha = 0;
    node.labelText.visible = false;
  }
}

function setNodeTransform(node, transform) {
  node.position.set(transform.x, transform.y);
  node.scale.set(transform.scale);
}

export class FolderCreateReleaseLayer extends Container {
  constructor(options = {}) {
    super();
    this.onReleaseComplete = options.onReleaseComplete || (() => {});
    this.frameGhost = new Graphics();
    this.targetAppGhost = new IconNode({ onAction: () => {} });
    this.draggedAppGhost = new IconNode({ onAction: () => {} });
    this.frameGhost.eventMode = "none";
    this.targetAppGhost.eventMode = "none";
    this.draggedAppGhost.eventMode = "none";
    this.addChild(this.frameGhost, this.targetAppGhost, this.draggedAppGhost);
    this.releaseKey = null;
    this.motionKey = null;
    this.completeKey = null;
    this.frameSize = null;
    this.visible = false;
  }

  clearVisuals(reason = FOLDER_CREATE_RELEASE_CLEAR_REASON) {
    killMotionOf(this.frameGhost, null, { reason });
    killMotionOf(this.frameGhost.scale, null, { reason });
    killMotionOf(this.targetAppGhost, null, { reason });
    killMotionOf(this.targetAppGhost.scale, null, { reason });
    killMotionOf(this.draggedAppGhost, null, { reason });
    killMotionOf(this.draggedAppGhost.scale, null, { reason });
    this.visible = false;
    this.frameGhost.visible = false;
    this.targetAppGhost.visible = false;
    this.draggedAppGhost.visible = false;
    this.releaseKey = null;
    this.motionKey = null;
    this.completeKey = null;
  }

  drawFrame(size) {
    const safeSize = Math.max(1, Number(size) || 1);
    if (this.frameSize === safeSize) return;
    this.frameSize = safeSize;
    drawFolderThumbFrame(this.frameGhost, safeSize, getFolderThumbMetrics(safeSize), 0);
  }

  update(state = {}) {
    const release = state.releaseState;
    if (!release?.folderId) {
      this.clearVisuals();
      return;
    }

    const releaseMotion = getFolderCreateReleaseMotion(release, state);
    const isNewRelease = this.releaseKey !== releaseMotion.releaseKey;
    const isNewMotion = this.motionKey !== releaseMotion.key;

    this.visible = true;
    this.frameGhost.visible = true;
    this.targetAppGhost.visible = true;
    this.draggedAppGhost.visible = true;
    this.drawFrame(releaseMotion.frame.targetSize);
    this.frameGhost.alpha = 1;
    this.targetAppGhost.alpha = 1;
    this.draggedAppGhost.alpha = 1;
    setIconGhostState(this.targetAppGhost, { ...releaseMotion.targetApp, stageRect: state.stageRect }, state);
    setIconGhostState(this.draggedAppGhost, { ...releaseMotion.draggedApp, stageRect: state.stageRect }, state);

    describeTarget(this.frameGhost, release, "release", "frame", "folderCreateRelease.frame");
    describeTarget(this.frameGhost.scale, release, "release", "frame.scale", "folderCreateRelease.frameScale", this.frameGhost);
    describeTarget(this.targetAppGhost, release, "release", "targetApp", "folderCreateRelease.targetApp");
    describeTarget(this.draggedAppGhost, release, "release", "draggedApp", "folderCreateRelease.draggedApp");

    if (isNewRelease) {
      killMotionOf(this.frameGhost, null, { reason: FOLDER_CREATE_RELEASE_START_REASON });
      killMotionOf(this.frameGhost.scale, null, { reason: FOLDER_CREATE_RELEASE_START_REASON });
      killMotionOf(this.targetAppGhost, null, { reason: FOLDER_CREATE_RELEASE_START_REASON });
      killMotionOf(this.targetAppGhost.scale, null, { reason: FOLDER_CREATE_RELEASE_START_REASON });
      killMotionOf(this.draggedAppGhost, null, { reason: FOLDER_CREATE_RELEASE_START_REASON });
      killMotionOf(this.draggedAppGhost.scale, null, { reason: FOLDER_CREATE_RELEASE_START_REASON });
      setNodeTransform(this.frameGhost, releaseMotion.frame.source);
      setNodeTransform(this.targetAppGhost, releaseMotion.targetApp.source);
      setNodeTransform(this.draggedAppGhost, releaseMotion.draggedApp.source);
      this.releaseKey = releaseMotion.releaseKey;
      this.completeKey = null;
    }

    if (!isNewMotion || !releaseMotion.hasTarget) return;
    this.motionKey = releaseMotion.key;
    const motionKey = releaseMotion.key;
    const completeRelease = () => {
      if (this.motionKey !== motionKey || this.completeKey === releaseMotion.releaseKey) return;
      this.completeKey = releaseMotion.releaseKey;
      this.onReleaseComplete(release);
    };
    const duration = releaseMotion.duration;
    parallel([
      motion(this.frameGhost)
        .duration(duration)
        .ease("power3.out")
        .handoff()
        .interrupt("retarget")
        .to({ x: releaseMotion.frame.target.x, y: releaseMotion.frame.target.y }),
      motion(this.frameGhost.scale)
        .duration(duration)
        .ease("power3.out")
        .handoff()
        .interrupt("retarget")
        .to({ x: releaseMotion.frame.target.scale, y: releaseMotion.frame.target.scale }),
      motion(this.targetAppGhost)
        .preset("handoff")
        .drag()
        .interrupt("retarget")
        .to({
          velocity: releaseMotion.velocity,
          x: releaseMotion.targetApp.target.x,
          y: releaseMotion.targetApp.target.y,
        }),
      motion(this.targetAppGhost.scale)
        .preset("handoff")
        .drag()
        .interrupt("retarget")
        .to({ x: releaseMotion.targetApp.target.scale, y: releaseMotion.targetApp.target.scale }),
      motion(this.draggedAppGhost)
        .preset("handoff")
        .drag()
        .interrupt("retarget")
        .to({
          velocity: releaseMotion.velocity,
          x: releaseMotion.draggedApp.target.x,
          y: releaseMotion.draggedApp.target.y,
        }),
      motion(this.draggedAppGhost.scale)
        .preset("handoff")
        .drag()
        .interrupt("retarget")
        .to({ x: releaseMotion.draggedApp.target.scale, y: releaseMotion.draggedApp.target.scale }),
    ], { onComplete: completeRelease });
  }

  destroy(options) {
    this.clearVisuals("destroyed");
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
