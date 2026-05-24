import { defineComponent, h } from "vue";
import { getFolderPreviewSlots } from "../domain/launchpadLayout.js";

function cx() {
  return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
}

function getIconSource(item) {
  return item?.customIconDataUrl || item?.iconDataUrl || item?.iconUrl || null;
}

function renderAppIcon(item) {
  const iconSource = getIconSource(item);
  if (iconSource) {
    return h("img", {
      class: "app-icon-image",
      src: iconSource,
      alt: "",
      draggable: "false",
    });
  }
  return h("span", { class: "icon-emoji" }, item.emoji);
}

function renderFolderChild(child) {
  if (!child) return "";
  const iconSource = getIconSource(child);
  if (iconSource) {
    return h("img", {
      class: "folder-child-image",
      src: iconSource,
      alt: "",
      draggable: "false",
    });
  }
  return child.emoji;
}

function renderStaticIcon(item, folderPreviewPageSize, textless) {
  const iconChildren = item.type === "folder"
    ? [
        h(
          "div",
          { class: "folder-thumb" },
          getFolderPreviewSlots(item, folderPreviewPageSize).map((child, index) =>
            h("div", { key: child ? child.id : `static-folder-empty-${index}`, class: cx("folder-child", !child && "folder-child-empty") }, renderFolderChild(child))
          )
        ),
      ]
    : [renderAppIcon(item)];

  return h("div", { key: item.id, class: "icon-cell static-icon-cell", "aria-hidden": "true" }, [
    h("div", { class: "icon-jiggle-wrap" }, [
      h("div", { class: "icon-selection-frame" }, [
        h("div", { class: "icon-hit-target static-icon-hit-target" }, [
          h("div", { class: "icon-visual-wrap" }, [
            h("div", { class: "icon-box" }, iconChildren),
          ]),
        ]),
        !textless ? h("div", { class: "icon-name" }, item.name) : null,
      ]),
    ]),
  ]);
}

export default defineComponent({
  name: "StaticPagePreview",
  props: {
    items: { type: Array, required: true },
    folderPreviewPageSize: { type: Number, default: 9 },
    textless: { type: Boolean, default: false },
  },
  setup(props) {
    return () =>
      props.items.map((item) => renderStaticIcon(item, props.folderPreviewPageSize, props.textless));
  },
});
