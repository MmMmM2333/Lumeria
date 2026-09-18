import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { readErrorMessage } from "../../application/errorMessage.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { createSettingsNavigation } from "../../application/settingsNavigation.js";
import { createNativeStateHost } from "../../application/stateHost.js";
import type { LaunchpadPages } from "../../domain/launchpadLayout.js";
import { mainWindowShortcutFromKeyboardEvent } from "../../platform/mainWindowShortcutInput.js";
import { nativeAboutSettingsPage } from "../../rendering/native/nativeAboutSettingsPage.js";
import { nativeAppsSettingsPage,type NativeAppsPageState } from "../../rendering/native/nativeAppsSettingsPage.js";
import type { NativeBackground } from "../../rendering/native/NativeBackground.js";
import { nativeDraftBackground,type NativeBackgroundPanelState } from "../../rendering/native/nativeBackgroundSettings.js";
import type { createNativeBrandingTextures } from "../../rendering/native/nativeBrandingTextures.js";
import { nativeGeneralSettingsPage } from "../../rendering/native/nativeGeneralSettingsPage.js";
import type { createNativeIconTextureRepository } from "../../rendering/native/nativeIconTextureLoader.js";
import { nativeLayoutSettingsPage } from "../../rendering/native/nativeLayoutSettingsPage.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import type { NativeSettingsButton } from "../../rendering/native/NativeSettingsButton.js";
import { NativeSettingsShell } from "../../rendering/native/NativeSettingsShell.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { createNativeShortcut } from "../nativeShortcut.js";
import type { createNativeLayoutState } from "../nativeStartup.js";

type NativeSettings = ReturnType<typeof createLaunchpadSettings>;
type NativeApps = ReturnType<typeof createLaunchpadApps>;
type NativeEditing = ReturnType<typeof createNativeEditing>;
type NativeLayoutState = ReturnType<typeof createNativeLayoutState>;
type NativeBrandingTextures = ReturnType<typeof createNativeBrandingTextures>;
type NativeIconTextures = ReturnType<typeof createNativeIconTextureRepository>;

// The settings window owns its shell lifetime, navigation, panel disclosure
// state and shortcut-recording flag. Committed/draft values stay owned by the
// shared `createLaunchpadSettings` business state; everything the controller
// needs from the entry assembly is a lazy reader so construction can happen
// before the later-created collaborators exist.
export type NativeSettingsControllerPorts = Readonly<{
  app: NativePixiApplication;
  syncLiveDesktop: () => void;
  openLogs: () => void;
  cancelNativeGesture: () => void;
  chooseColor: (initial: number) => Promise<number | null>;
  closeFolder: () => boolean;
  editItem: (item: SceneItem | null) => void;
  getApps: () => NativeApps | null;
  brandingTextures: () => NativeBrandingTextures["textures"];
  chromeInset: () => number;
  commitEditedPages: (pages: LaunchpadPages) => void;
  desktopBackground: () => NativeBackground;
  getEditing: () => NativeEditing | null;
  getIconTextures: () => NativeIconTextures;
  getManagement: () => NativeManagement;
  getSaves: () => Readonly<{ flush(): Promise<void> }>;
  getSearchBar: () => NativeSearchBar;
  getSettingsButton: () => NativeSettingsButton;
  getSystemAppearance: () => "dark" | "light";
  getTray: () => Readonly<{ refresh(): void }> | null;
  layoutState: () => NativeLayoutState;
  mainShortcut: () => ReturnType<typeof createNativeShortcut>;
  onApplied: (config: ReturnType<NativeLayoutState["captureConfiguration"]>) => void;
  refreshBackground: () => Promise<void>;
  requestSceneRender: () => void;
  settings: () => NativeSettings;
  settingsTheme: () => "dark" | "light";
  t: (key: string, values?: Record<string, string | number>) => string;
}>;

export type NativeSettingsController = Readonly<{
  readonly appsPageState: NativeAppsPageState;
  readonly backgroundPanelState: NativeBackgroundPanelState;
  readonly navigation: ReturnType<typeof createSettingsNavigation>;
  readonly shell: NativeSettingsShell | null;
  readonly windowPanelState: { mode: boolean; material: boolean; advanced: boolean };
  close: () => void;
  dispose: () => void;
  isExpandedIcons: () => boolean;
  isRecordingShortcut: () => boolean;
  open: () => void;
  redraw: () => void;
  toggleExpandedIcons: () => void;
}>;

export function createNativeSettingsController(ports: NativeSettingsControllerPorts): NativeSettingsController {
  const navigation=createSettingsNavigation(createNativeStateHost(()=>{}),key=>ports.t(key));
  navigation.selectTab("general");
  // A user-editable panel choice, initially matching the already-read system theme.
  const backgroundPanelState:NativeBackgroundPanelState={layer:false,effect:false,error:"",
    profile:ports.getSystemAppearance()};
  const windowPanelState={mode:false,material:false,advanced:false};
  const appsPageState:NativeAppsPageState={keywords:false,excludedQuery:"",excludedKeys:new Set()};
  let shell:NativeSettingsShell|null=null;
  let recordingShortcut=false,expandedIcons=false;

  const stopShortcutRecording=()=>{
    if(!recordingShortcut)return true;
    try{ports.mainShortcut().resume();recordingShortcut=false;return true;}
    catch(error){ports.settings().actions.setMainWindowShortcutError(String(error));return false;}
  };
  const recordShortcut=()=>{
    try{ports.mainShortcut().suspend();recordingShortcut=true;ports.settings().actions.setMainWindowShortcutError("");}
    catch(error){ports.settings().actions.setMainWindowShortcutError(String(error));}
    shell?.redraw();
  };
  const close=()=>{
    if(shell?.applying)return;
    if(!stopShortcutRecording()){shell?.redraw();return;}
    ports.getSearchBar().host.blur();shell?.destroy();shell=null;
    ports.settings().cancelEdit();ports.requestSceneRender();
  };
  const open=()=>{
    const settings=ports.settings();
    if(shell||ports.getEditing()!.drag.isDragActive())return;
    ports.cancelNativeGesture();
    ports.closeFolder();ports.getEditing()!.selection.clear();ports.getEditing()!.alt.cancelAltEditMode();ports.getSearchBar().host.blur();
    const app=ports.app;
    const startupStatus=settings.beginEdit();
    shell=new NativeSettingsShell({
      navigation,t:key=>ports.t(key),tabs:["general","interface","apps","about"],
      beforeKey:event=>{
        if(!recordingShortcut)return false;
        if(event.type!=="down")return true;
        const result=mainWindowShortcutFromKeyboardEvent(event);
        if(result.status==="valid"){settings.actions.setDraftMainWindowShortcut(result.shortcut);stopShortcutRecording();}
        else if(result.status==="cancel")stopShortcutRecording();
        else settings.actions.setMainWindowShortcutError(ports.t(`settings.general.shortcut.invalid.${result.reason}`));
        shell?.redraw();return true;
      },
      theme:()=>ports.settingsTheme(),
      size:()=>app.contentSize,topInset:ports.chromeInset,invalidate:()=>app.invalidate(),close,
      anchor:()=>({x:ports.getSettingsButton().x,y:ports.getSettingsButton().y,width:34,height:34}),
      content:(tab,subPage,width)=>tab==="apps"
        ?nativeAppsSettingsPage({apps:ports.getApps()!,host:ports.getSearchBar().host,width,theme:ports.settingsTheme(),state:appsPageState,subPage,management:ports.getManagement(),icons:ports.getIconTextures(),
          invalidate:()=>app.invalidate(),redraw:()=>shell?.redraw(),
          navigate:page=>{navigation.openSubPage({id:page==="manager"?"apps.appManager":"apps.excludedApps",parentTabId:"apps",
            labelKey:page==="manager"?"settings.apps.manager.title":"settings.apps.excluded.title"});shell?.redraw();},
          edit:item=>ports.editItem(item as SceneItem|null)})
        :tab==="general"
        ?nativeGeneralSettingsPage({settings,width,theme:ports.settingsTheme(),
          management:ports.getManagement(),invalidate:()=>app.invalidate(),redraw:()=>shell?.redraw(),recording:recordingShortcut,
          record:recordShortcut,expanded:expandedIcons,expand:()=>{expandedIcons=!expandedIcons;shell?.redraw();},icons:ports.brandingTextures(),openLogs:ports.openLogs})
        :tab==="about"
        ?nativeAboutSettingsPage(width,ports.settingsTheme(),ports.brandingTextures().get(settings.draft.launchpadIconVariant.value)!)
        :nativeLayoutSettingsPage(settings,ports.getSearchBar().host,width,()=>app.invalidate(),
          ports.settingsTheme(),()=>shell?.redraw(),{renderer:app.renderer,renderHost:app,size:app.contentSize,state:backgroundPanelState,systemAppearance:ports.getSystemAppearance(),
            chooseColor:color=>ports.chooseColor(color)},windowPanelState,()=>ports.getEditing()!.pageCommands.confirmForceFillAllPages()),
      apply:async()=>{
        if(!stopShortcutRecording())throw new Error(settings.presentation.mainWindowShortcutError.value);
        if(settings.presentation.isChoosingBackgroundImage.value)throw new Error(ports.t("settings.interface.background.layer.choosing"));
        try{
          await ports.desktopBackground().configure(nativeDraftBackground(settings),app.contentSize.width,app.contentSize.height,undefined,ports.getSystemAppearance());
        }catch(error){
          try{await ports.refreshBackground();}
          catch(rollback){throw new AggregateError([error,rollback],`${readErrorMessage(error)}\n${readErrorMessage(rollback)}`);}
          throw error;
        }
        const outcome=await settings.applyEdit({syncLiveDesktop:ports.syncLiveDesktop});
        if(!outcome.ok){
          const errors:unknown[]=[outcome.error];
          if("rollbackErrors" in outcome&&Array.isArray(outcome.rollbackErrors))errors.push(...outcome.rollbackErrors);
          try{await ports.refreshBackground();}catch(error){errors.push(error);}
          throw new Error(errors.map(readErrorMessage).filter(Boolean).join("\n"));
        }
        await ports.refreshBackground();
        const config=ports.layoutState().captureConfiguration();
        ports.onApplied(config);
        ports.commitEditedPages(ports.layoutState().operations.clonePages(ports.layoutState().presentation.pages.value));
        await ports.getSaves().flush();
        ports.getTray()?.refresh();
      },
    });
    const openedShell=shell;
    void startupStatus.then(()=>{if(shell===openedShell&&!openedShell.destroyed&&navigation.activeRoute.value.tabId==="general")openedShell.refreshContent();});
    app.stage.addChild(shell);ports.requestSceneRender();
  };

  return Object.freeze({
    get appsPageState(){return appsPageState;},
    get backgroundPanelState(){return backgroundPanelState;},
    get navigation(){return navigation;},
    get shell(){return shell;},
    get windowPanelState(){return windowPanelState;},
    close,
    dispose:()=>{shell?.destroy();shell=null;},
    isExpandedIcons:()=>expandedIcons,
    isRecordingShortcut:()=>recordingShortcut,
    open,
    redraw:()=>{shell?.redraw();},
    toggleExpandedIcons:()=>{expandedIcons=!expandedIcons;shell?.redraw();},
  });
}
