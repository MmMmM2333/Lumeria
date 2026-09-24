import type { LaunchpadIconScope } from "../../domain/iconFocus.js";
import { findFocusedIcon,firstIconFocus,moveIconFocus } from "../../domain/iconFocus.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { NativeFolderFlow } from "./nativeInputRouter.js";

import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { NativeFolderNameInput } from "../../rendering/native/NativeFolderNameInput.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeNotice } from "../../rendering/native/NativeNotice.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { NativeSelectionToolbar } from "../../rendering/native/NativeSelectionToolbar.js";
import type { SceneFocusedIcon,SceneItem } from "../../rendering/sceneFrame.js";
import { getNativePageTurnFromKey,type NativeNavigationKey,type NativePageTurn } from "../nativeStartup.js";

type NativeEditing = ReturnType<typeof createNativeEditing>;

export type NativeSelectionScope = Readonly<{ key: string; orderedIds: readonly string[] }>;

// Keyboard routing owns its algorithm only; every product fact it reads is an
// explicit live reader and every effect is an explicit command. Mutable product
// state (editing, settings shell, launch flow, window closing) stays owned by
// the entry assembly and is observed through these readers.
export type NativeKeyboardRouterPorts = Readonly<{
  activateItem: (item: SceneItem, event?: { shiftKey?: boolean }) => void;
  app: NativePixiApplication;
  cancelNativeGesture: () => void;
  closeFolder: () => boolean;
  dismissLaunchpad: () => void;
  editItem: (item: SceneItem | null) => void;
  folderFlow: NativeFolderFlow;
  folderNameInput: NativeFolderNameInput;
  getCurrentIconScope: () => LaunchpadIconScope<SceneItem>;
  getEditing: () => NativeEditing | null;
  getFocusedIcon: () => SceneFocusedIcon | null;
  getSelectionScope: () => NativeSelectionScope;
  getSettingsShell: () => Readonly<{ handleKey(event: NativeNavigationKey): boolean }> | null;
  isInteractionBlocked: () => boolean;
  isSearchMode: () => boolean;
  isWindowClosing: () => boolean;
  management: NativeManagement;
  noticeView: NativeNotice;
  removeItems: (ids: readonly string[]) => void;
  searchBar: NativeSearchBar;
  selectionToolbar: NativeSelectionToolbar;
  setFocusedIcon: (focusedIcon: SceneFocusedIcon | null) => void;
  turnFolderPage: (direction: Exclude<NativePageTurn, 0>) => boolean;
  turnPage: (direction: Exclude<NativePageTurn, 0>) => boolean;
}>;

// Callback stays synchronous and priority-preserving: the same early returns,
// composing guards and modal/settings ordering as the previous inline handler.
export function createNativeKeyboardRouter(ports: NativeKeyboardRouterPorts): Readonly<{
  handleKey: (event: NativeNavigationKey) => boolean;
}> {
  const {
    activateItem, app, cancelNativeGesture, closeFolder, dismissLaunchpad, editItem, folderFlow,
    folderNameInput, getCurrentIconScope, getEditing, getFocusedIcon, getSelectionScope, getSettingsShell,
    isInteractionBlocked, isSearchMode, isWindowClosing, management, noticeView, removeItems, searchBar,
    selectionToolbar, setFocusedIcon, turnFolderPage, turnPage,
  } = ports;

  const handleKey = (event: NativeNavigationKey): boolean => {
    const editing = getEditing();
    const settingsShell = getSettingsShell();
    if(isWindowClosing())return true;
    if(isInteractionBlocked())return true;
    if(event.type==="up") {editing?.alt.handleAltKeyUp(event);return false;}
    if(management.modal) {
      const handled=management.handleKey(event);app.invalidate();return handled;
    }
    if(settingsShell){
      if(searchBar.host.focused?.composing||event.isComposing)return false;
      return settingsShell.handleKey(event);
    }
    if (folderNameInput.input.focused) {
      if (folderNameInput.input.composing || event.isComposing) return false;
      if (event.key === "Enter" || event.key === "Tab") { folderNameInput.input.blur(); return true; }
      if (event.key !== "Escape") return false;
      folderNameInput.input.blur();
    }
    if (searchBar.input.composing || event.isComposing) return false;
    if(noticeView.hasFocus){
      if(noticeView.handleKey(event.key??"",Boolean(event.shiftKey)))return true;
      if(event.key==="Tab")searchBar.focusEditor();
      return true;
    }
    if(editing?.drag.isDragActive()){
      if(event.key==="Escape")editing.drag.cancelDrag({userInitiatedCancel:true});
      return true;
    }
    if(editing?.selection.isActive.value&&(event.key==="Tab"||selectionToolbar.hasFocus)&&selectionToolbar.handleKey(event.key??"",Boolean(event.shiftKey))){setFocusedIcon(null);return true;}
    if(event.key==="Escape" && editing?.selection.isActive.value){
      if(!editing.selection.isFrozen.value)editing.selection.clear();
      return true;
    }
    if (searchBar.input.focused) {
      if(event.key==="Escape" && (searchBar.input.value || searchBar.explicitEditing)) {searchBar.setQuery("");searchBar.input.blur();return true;}
      // Keep the native text session alive while arrows navigate type-to-search results.
      if(event.key?.startsWith("Arrow")&&searchBar.explicitEditing)return false;
      if(event.key==="Tab"){
        if(!searchBar.explicitEditing){searchBar.focusEditor();setFocusedIcon(null);return true;}
        if(event.shiftKey&&noticeView.focusEdge(true)){searchBar.input.blur();return true;}
        // Returning to result navigation must retain text/IME input, including Backspace.
        searchBar.focusForTyping();
        setFocusedIcon(getFocusedIcon()??firstIconFocus(getCurrentIconScope()));
        return true;
      }
      if(event.key==="Enter")searchBar.input.blur();
      else if(event.key!=="Escape" && !event.key?.startsWith("Arrow") && !event.altKey
        && !["Alt","F2"].includes(event.key??""))return false;
    }
    editing?.alt.handleAltKeyDown(event);
    if(editing?.alt.isAltKeyEvent(event))return true;
    if(event.type === "down" && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key?.toLowerCase()==="a" && editing?.selection.isActive.value) {
      editing.selection.selectScope(getSelectionScope());return true;
    }
    if(event.type==="down" && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key?.toLowerCase()==="n" && editing?.selection.isActive.value){editing.createFolder();return true;}
    if(event.type==="down" && event.key==="F2") {const item=findFocusedIcon(getFocusedIcon(),getCurrentIconScope());if(item)editItem(item);return true;}
    if(event.type==="down" && event.key==="Delete" && editing?.selection.isActive.value) {if(editing.selection.selectedCount.value)removeItems([...editing.selection.selectedIds.value]);return true;}
    if(editing?.selection.isActive.value && event.key===" " && !event.altKey){
      const item=findFocusedIcon(getFocusedIcon(),getCurrentIconScope());
      if(item?.type==="app")void activateItem(item,event);
      return true;
    }
    if(editing?.selection.isActive.value && (event.key==="Enter" || event.key==="Backspace" || (!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key?.length===1)))return true;
    if(event.type==="down" && event.key==="Tab") {
      if(noticeView.focusEdge(Boolean(event.shiftKey))){setFocusedIcon(null);return true;}
      if(folderFlow.snapshot().renderedFolder || editing?.selection.isActive.value)setFocusedIcon(getFocusedIcon()??firstIconFocus(getCurrentIconScope()));
      else searchBar.focusEditor();
      return true;
    }
    if(event.type==="down" && !searchBar.input.focused && !event.ctrlKey && !event.altKey && !event.metaKey && event.key?.length===1 && event.key!==" " && !folderFlow.snapshot().renderedFolder) {
      // The native text session starts after this key's character message; transfer its first character once.
      searchBar.focusForTyping();searchBar.input.commitText(event.key);return true;
    }
    if (event.type !== "down" || event.isComposing || event.altKey || event.metaKey) return false;
    const key = event.key || event.code;
    const direction = getNativePageTurnFromKey(event);
    const arrow = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
    if (event.ctrlKey && direction === 0) return false;
    if (!arrow && key !== "Enter" && key !== "Escape") return false;
    if (event.repeat && !arrow) return true;
    cancelNativeGesture();
    const folder = folderFlow.snapshot();
    if (key === "Escape") {
      if(folder.renderedFolder)closeFolder();
      else if(isSearchMode())searchBar.setQuery("");
      else dismissLaunchpad();
      return true;
    }
    if (folder.isClosing) return true;
    if (direction !== 0) {
      const changed = folder.renderedFolder ? turnFolderPage(direction) : turnPage(direction);
      if (changed) setFocusedIcon(firstIconFocus(getCurrentIconScope()));
      return true;
    }
    const scope = getCurrentIconScope();
    if (arrow) {
      setFocusedIcon(moveIconFocus(getFocusedIcon(), scope, key));
    } else if (key === "Enter") {
      const focused = findFocusedIcon(getFocusedIcon(), scope);
      if (focused) void activateItem(focused);
      else setFocusedIcon(firstIconFocus(scope));
    }
    return true;
  };

  return Object.freeze({ handleKey });
}
