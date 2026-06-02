import { defineComponent, h } from "vue";
import { Motion } from "motion-v";
import { getIconSource } from "../domain/iconSource.js";
import { getFolderPreviewSlots } from "../domain/launchpadLayout.js";
import MissingLaunchTargetBadge from "./MissingLaunchTargetBadge.js";

const springRest = { restDelta: 0.01, restSpeed: 0.01 };

function cx() {
  return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
}

export default defineComponent({
  name: "DesktopIcon",
  props: {
    item: { type: Object, required: true },
    source: { type: Object, required: true },
    dragging: { type: Boolean, default: false },
    compact: { type: Boolean, default: false },
    folderPreviewPageSize: { type: Number, default: 9 },
    draggable: { type: Boolean, default: true },
    editing: { type: Boolean, default: false },
    textless: { type: Boolean, default: false },
    layoutEnabled: { type: Boolean, default: true },
    removable: { type: Boolean, default: false },
    selected: { type: Boolean, default: false },
    dropTarget: { type: Boolean, default: false },
    ghosted: { type: Boolean, default: false },
    emerging: { type: Boolean, default: false },
    emergingDelay: { type: Number, default: 0 },
    opening: { type: Boolean, default: false },
    launchTargetStatus: { type: String, default: null },
  },
  emits: ["pointerdown-icon", "open-app", "context-menu-icon", "remove-app", "choose-app-icon", "reset-app-icon"],
  setup(props, { emit }) {
    function renderAppIcon(item, compact) {
      const iconSource = getIconSource(item);
      if (iconSource) {
        return h("img", {
          class: cx("app-icon-image", compact && "app-icon-image-compact"),
          src: iconSource,
          alt: "",
          draggable: "false",
        });
      }
      return h("span", { class: compact ? "icon-emoji icon-emoji-compact" : "icon-emoji" }, item.emoji);
    }

    function renderFolderChild(child) {
      if (!child) return "";
      const iconSource = getIconSource(child);
      if (iconSource) {
        return h("img", {
          class: "folder-child-visual folder-child-image",
          src: iconSource,
          alt: "",
          draggable: "false",
        });
      }
      return h("span", { class: "folder-child-visual folder-child-emoji" }, child.emoji);
    }

    function handlePointerDown(event) {
      if (event.button === 2) return;
      if (!props.draggable) return;
      emit("pointerdown-icon", event, props.item, props.source);
    }

    function handleClick() {
      if (props.draggable || props.item.type !== "app") return;
      emit("open-app", props.item, props.source);
    }

    function handleContextMenu(event) {
      if (props.item.type !== "app") return;
      event.preventDefault();
      event.stopPropagation();
      emit("context-menu-icon", event, props.item, props.source);
    }

    function handleRemove(event) {
      event.preventDefault();
      event.stopPropagation();
      if (props.item.type !== "app") return;
      emit("remove-app", props.item.id);
    }

    function handleChooseIcon(event) {
      event.preventDefault();
      event.stopPropagation();
      if (props.item.type !== "app") return;
      emit("choose-app-icon", props.item.id);
    }

    function handleResetIcon(event) {
      event.preventDefault();
      event.stopPropagation();
      if (props.item.type !== "app") return;
      emit("reset-app-icon", props.item.id);
    }

    return () => {
      const item = props.item;
      const isFolder = item.type === "folder";
      const iconChildren = [];
      const motionTransition = {
        opacity: { duration: props.opening ? 0.22 : 0.12 },
        scale: props.opening ? { type: "spring", stiffness: 260, damping: 21, mass: 0.8, ...springRest } : { duration: 0.12 },
      };
      if (props.layoutEnabled) {
        motionTransition.layout = { type: "spring", stiffness: 520, damping: 34, mass: 0.75, ...springRest };
      }

      if (isFolder) {
        const folderChildren = getFolderPreviewSlots(item, props.folderPreviewPageSize).map((child, index) =>
          h("div", {
            key: child ? child.id : `folder-empty-${index}`,
            class: cx("folder-child", !child && "folder-child-empty"),
            "data-folder-preview-folder-id": props.source.type === "page" && child ? item.id : undefined,
            "data-folder-preview-child-id": props.source.type === "page" && child ? child.id : undefined,
            "data-folder-preview-slot-index": props.source.type === "page" && child ? index : undefined,
          }, renderFolderChild(child))
        );
        iconChildren.push(h("div", { class: "folder-thumb" }, folderChildren));
      } else {
        iconChildren.push(renderAppIcon(item, props.compact));
      }

      const removeButton = props.editing && props.removable && item.type === "app"
        ? h("button", {
            class: "remove-app-button",
            type: "button",
            title: `移除 ${item.name}`,
            "aria-label": `移除 ${item.name}`,
            onPointerdown: (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
            onClick: handleRemove,
          }, "×")
        : null;
      const chooseIconButton = props.editing && item.type === "app"
        ? h("button", {
            class: "change-app-icon-button",
            type: "button",
            title: `更换 ${item.name} 的图标`,
            "aria-label": `更换 ${item.name} 的图标`,
            onPointerdown: (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
            onClick: handleChooseIcon,
          }, "+")
        : null;
      const resetIconButton = props.editing && item.type === "app" && (item.customIconPath || item.customIconDataUrl)
        ? h("button", {
            class: "reset-app-icon-button",
            type: "button",
            title: `恢复 ${item.name} 的系统图标`,
            "aria-label": `恢复 ${item.name} 的系统图标`,
            onPointerdown: (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
            onClick: handleResetIcon,
          }, "↺")
        : null;
      const missingBadge = item.type === "app"
        ? h(MissingLaunchTargetBadge, { status: props.launchTargetStatus })
        : null;
      const hitTargetAttrs = {
        class: cx(
          "icon-hit-target",
          props.draggable && "icon-hit-target-draggable",
          !props.draggable && "icon-hit-target-clickable"
        ),
        style: { touchAction: props.draggable ? "none" : "manipulation" },
        "data-launch-item-id": item.id,
        "data-launch-area": props.source.type === "folder" ? "folder" : props.source.type === "search" ? "search" : "desktop",
        "data-launch-page-index": props.source.pageIndex ?? 0,
        "data-launch-folder-id": props.source.type === "folder" ? props.source.folderId : undefined,
        "data-top-item-id": props.source.type === "page" ? item.id : undefined,
        "data-top-item-kind": props.source.type === "page" ? item.type : undefined,
        onPointerdown: handlePointerDown,
        onClick: handleClick,
        onContextmenu: handleContextMenu,
      };

      const cellChildren = [
        h("div", { class: cx("icon-jiggle-wrap", props.editing && "icon-cell-jiggling") }, [
          h("div", {
            class: cx("icon-selection-frame", props.selected && "icon-selection-frame-selected", props.dropTarget && "icon-selection-frame-drop-target"),
            "data-folder-open-folder-id": props.source.type === "folder" ? props.source.folderId : undefined,
            "data-folder-open-child-id": props.source.type === "folder" ? item.id : undefined,
          }, [
            h("div", hitTargetAttrs, [
              h("div", { class: "icon-visual-wrap" }, [
                removeButton,
                chooseIconButton,
                resetIconButton,
                h("div", { class: cx("icon-box", props.compact && "icon-box-compact") }, iconChildren),
                missingBadge,
              ]),
            ]),
            !props.textless ? h("div", { class: "icon-name" }, item.name) : null,
          ]),
        ]),
      ];
      const cellStyle = { visibility: props.dragging ? "hidden" : "visible" };
      if (props.emerging) cellStyle["--folder-open-icon-delay"] = `${props.emergingDelay}ms`;

      const cellAttrs = {
        class: cx(
          "icon-cell",
          props.compact && "icon-cell-compact",
          props.dragging && "icon-cell-dragging",
          props.editing && "icon-cell-editing",
          props.selected && "icon-cell-selected",
          props.dropTarget && "icon-cell-drop-target",
          props.ghosted && "icon-cell-ghosted",
          props.emerging && "icon-cell-emerging",
          props.opening && "icon-cell-opening"
        ),
        style: cellStyle,
      };

      if (!props.layoutEnabled && !props.opening && !props.dragging) {
        return h("div", cellAttrs, cellChildren);
      }

      return h(
        Motion,
        {
          ...cellAttrs,
          layout: props.layoutEnabled ? "position" : false,
          initial: false,
          animate: {
            opacity: props.opening || props.dragging ? 0 : 1,
            scale: props.opening ? 1.82 : 1,
            rotate: 0,
          },
          transition: motionTransition,
        },
        { default: () => cellChildren }
      );
    };
  },
});
