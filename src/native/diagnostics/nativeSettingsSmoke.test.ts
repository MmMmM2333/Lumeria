import assert from "node:assert/strict";
import { NativeScrollView } from "../../rendering/native/NativeScrollView.js";
import { join } from "node:path";
import { Container,Rectangle,Text } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createLaunchpadApps } from "../../application/launchpadApps.js";
import type { createLaunchpadNotices } from "../../application/launchpadNotices.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import type { createSettingsNavigation } from "../../application/settingsNavigation.js";
import { createDefaultScanRoots } from "../../domain/launchpadData.js";
import { LAUNCHPAD_ICON_VARIANTS } from "../../domain/launchpadIconVariant.js";
import type { LaunchpadPages } from "../../domain/launchpadLayout.js";
import { DEFAULT_SCAN_ROOTS } from "../../platform/applicationCatalogDefaults.js";
import { NativeAppDialogs } from "../../rendering/native/NativeAppDialogs.js";
import { NativeBackground } from "../../rendering/native/NativeBackground.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import { NativeFluentButton } from "../../rendering/native/NativeFluentButton.js";
import { NativeFluentToggle } from "../../rendering/native/NativeFluentToggle.js";
import { NativeManagement } from "../../rendering/native/NativeManagement.js";
import { NativeNotice } from "../../rendering/native/NativeNotice.js";
import { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import { NativeSettingsShell } from "../../rendering/native/NativeSettingsShell.js";
import type { NativeWindowChrome } from "../../rendering/native/NativeWindowChrome.js";
import { nativeBackgroundSettings,type NativeBackgroundPanelState } from "../../rendering/native/nativeBackgroundSettings.js";
import { NativeDataHost } from "../nativeDataHost.js";
import { getNativeLocale,nativeLocaleOptions,setNativeLocale,t } from "../nativeLocalization.js";
import type { createNativeLayoutState,NativeNavigationKey } from "../nativeStartup.js";

type NativeSettings = ReturnType<typeof createLaunchpadSettings>;
type NativeApps = ReturnType<typeof createLaunchpadApps>;
type NativeLayoutState = ReturnType<typeof createNativeLayoutState>;
type NativeNotices = ReturnType<typeof createLaunchpadNotices>;
type NativeSettingsNavigation = ReturnType<typeof createSettingsNavigation>;
type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

export type NativeSettingsSmokeContext = Readonly<{
  app: NativePixiApplication;
  appDialogs: () => NativeAppDialogs | null;
  apps: () => NativeApps;
  appsPageState: { keywords: boolean; excludedQuery: string; excludedKeys: Set<string> };
  backgroundPanelState: NativeBackgroundPanelState;
  backgroundBaseline: Parameters<NativeBackground["configure"]>[0];
  baselineConfig: ReturnType<NativeLayoutState["captureConfiguration"]>;
  baselinePages: LaunchpadPages;
  brandingDirectory: string;
  capture: (name: string) => Promise<void>;
  captureOwnedWindow: NativeSmokeSupport["captureOwnedWindow"];
  commitEditedPages: (pages: LaunchpadPages) => void;
  desktopBackground: NativeBackground;
  dragOwnedNativeWindow: NativeSmokeSupport["dragOwnedNativeWindow"];
  getRecordingShortcut: () => boolean;
  getSettingsShell: () => NativeSettingsShell | null;
  isWindowClosing: () => boolean;
  launchFlow: Readonly<{ isDesktopOpen: Readonly<{ value: boolean }>; isDesktopClosing: Readonly<{ value: boolean }> }>;
  layoutSettings: NativeSettings["layoutSettings"];
  layoutState: NativeLayoutState;
  management: NativeManagement;
  nativeData: NativeDataHost;
  navigation: NativeSettingsNavigation;
  notices: NativeNotices;
  noticeView: NativeNotice;
  onKey: (event: NativeNavigationKey) => boolean;
  openSettings: () => void;
  present: (description: string) => Promise<void>;
  refreshBackground: () => Promise<void>;
  requestQuit: () => void;
  restoreCommittedLayout: (config: ReturnType<NativeLayoutState["captureConfiguration"]>, pages: LaunchpadPages) => Promise<void>;
  saves: Readonly<{ flush(): Promise<void> }>;
  scene: NativeDesktopScene;
  searchBar: NativeSearchBar;
  settings: NativeSettings;
  settingsButton: Container;
  settingsTheme: () => "dark" | "light";
  showLaunchpad: () => void;
  systemAppearance: () => "dark" | "light";
  smoke: NativeSmokeSupport;
  tray: () => Readonly<{ id: number }> | null;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
  windowChrome: NativeWindowChrome;
  windowPanelState: { mode: boolean; material: boolean; advanced: boolean };
}>;

// Full native settings / application-management verification. Live product
// state is read through the context getters (`getSettingsShell`, `apps`) so the
// scenario never holds a stale capture; deliberate fault injection restores the
// original hooks in `finally` blocks.
export async function runNativeSettingsSmoke(context: NativeSettingsSmokeContext): Promise<void> {
  const {
    app, appDialogs, apps, appsPageState, backgroundPanelState, baselineConfig, baselinePages,
    brandingDirectory, capture, captureOwnedWindow, commitEditedPages,
    desktopBackground, dragOwnedNativeWindow, getRecordingShortcut, getSettingsShell,
    isWindowClosing, launchFlow, layoutSettings, layoutState, management, nativeData, navigation,
    notices, noticeView, onKey, openSettings, present, refreshBackground, requestQuit,
    restoreCommittedLayout, saves, scene, searchBar, settings, settingsButton,
    settingsTheme, smoke, tray, waitFor, windowChrome, windowPanelState,
  } = context;
  const clickWithNativeInput = (target: Parameters<typeof smoke.clickWithNativeInput>[1]) => smoke.clickWithNativeInput(app, target);
  const backgroundBaseline=context.backgroundBaseline;
  const cachedBackground=await nativeData.background({path:join(brandingDirectory,"light.png")});
  assert.ok(cachedBackground);
  for(const effect of ["none","dimmed","blur","acrylic"] as const){
    await desktopBackground.configure({...backgroundBaseline,backgroundSource:"customImage",backgroundImagePath:cachedBackground.imagePath,
      backgroundImageOpacity:100,backgroundEffect:effect},app.contentSize.width,app.contentSize.height);
    await present(`native background ${effect}`);
    await capture(`background-${effect}`);
  }
  await refreshBackground();
  clickWithNativeInput(settingsButton);await present("native settings opened");
  assert.ok(getSettingsShell(),"settings button must open the native settings shell");
  await waitFor("settings entrance settles",()=>!scene.getMotionSnapshot().active);
  await present("settings layout settled");
  await capture("settings-layout");
  await (await import("./nativeAppsLayoutSmoke.js")).runNativeAppsLayoutSmoke(context);
  const aboutTab=app.stage.getChildByLabel("native-settings-tab:about",true);assert.ok(aboutTab);
  clickWithNativeInput(aboutTab);await present("native about route");
  await waitFor("about entrance settles",()=>!scene.getMotionSnapshot().active);
  await capture("settings-about");
  const generalTab=app.stage.getChildByLabel("native-settings-tab:general",true);assert.ok(generalTab);
  clickWithNativeInput(generalTab);await present("native general settings");
  await waitFor("general entrance settles",()=>!scene.getMotionSnapshot().active);
  await capture("settings-general");
  const iconSummary=app.stage.getChildByLabel("native-setting:icon-summary",true) as Text;
  const iconSummaryRow=app.stage.getChildByLabel("native-setting:icon-expand",true) as NativeFluentButton;
  assert.equal(iconSummary.anchor.x,1);assert.equal(iconSummary.x,iconSummaryRow.controlWidth-47,"summary right edge must track arrow column, not fixed text start");
  {
    const {nativeUiGallery}=await import("../../rendering/native/ui/nativeUiGallery.js");
    for(const theme of ["dark","light"] as const){
      const gallery=nativeUiGallery(searchBar.host,theme,()=>app.invalidate());app.stage.addChild(gallery);
      await present(`UI gallery ${theme}`);await capture(`native-ui-gallery-${theme}`);gallery.destroy({children:true});
    }
    await present("UI gallery disposed");
  }
  const styleThemeBefore=settings.draft.settingsThemePreference.value;
  for(const theme of ["dark","light"] as const){
    settings.actions.setDraftSettingsThemePreference(theme);(getSettingsShell() as NativeSettingsShell).redraw();await present(`style ${theme} ready`);
    const hoverRow=app.stage.getChildByLabel("native-setting:icon-expand",true) as NativeFluentButton;
    assert.equal(hoverRow.parent!.getChildIndex(hoverRow),0,"hover paint must be behind row icon and title");
    const p=hoverRow.toGlobal({x:Math.min(220,hoverRow.controlWidth/2),y:36});app.nativeInput.emitPointer("pointermove",p.x,p.y,0);
    await present(`style ${theme} hover`);await capture(`settings-style-${theme}-hover`);
    clickWithNativeInput(app.stage.getChildByLabel("native-setting:language",true)!);
    await waitFor("language popup entrance",()=>!scene.getMotionSnapshot().active);await present(`style ${theme} popup`);
    assert.ok(management.getChildByLabel("native-menu:selected-indicator",true));await capture(`settings-style-${theme}-dropdown`);
    onKey({type:"down",key:"Escape"});await present("style dropdown dismissed");
  }
  settings.actions.setDraftSettingsThemePreference(styleThemeBefore);(getSettingsShell() as NativeSettingsShell).redraw();await present("style theme restored");
  const sidebar=getSettingsShell() as NativeSettingsShell;
  const languageBefore=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();
  const beforeLanguage={x:languageBefore.x,y:languageBefore.y,width:languageBefore.width,height:languageBefore.height};
  sidebar.toggleNavigation();
  const languageStart=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();
  assert.ok(Math.abs(languageStart.x-beforeLanguage.x)<0.1&&Math.abs(languageStart.y-beforeLanguage.y)<0.1,"sidebar toggle must not jump right-aligned controls before the first animation frame");
  await waitFor("sidebar intermediate width",()=>sidebar.navigationWidth>72&&sidebar.navigationWidth<215);
  await capture("settings-sidebar-expanding");
  const languageMid=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();const midpoint={x:languageMid.x,y:languageMid.y};
  sidebar.toggleNavigation();
  const languageReverse=app.stage.getChildByLabel("native-setting:language",true)!.getBounds();
  assert.ok(Math.abs(languageReverse.x-midpoint.x)<0.1&&Math.abs(languageReverse.y-midpoint.y)<0.1,"reversing sidebar keeps current content geometry");
  await present("sidebar reverse");sidebar.toggleNavigation();
  await waitFor("sidebar expanded width",()=>sidebar.navigationWidth===220&&!scene.getMotionSnapshot().active);await capture("settings-sidebar-expanded");
  sidebar.toggleNavigation();await waitFor("sidebar collapsed width",()=>sidebar.navigationWidth===68&&!scene.getMotionSnapshot().active);
  const disclosureButton=app.stage.getChildByLabel("native-setting:icon-expand",true) as NativeFluentButton;
  assert.ok(disclosureButton);clickWithNativeInput(disclosureButton);
  assert.equal(disclosureButton.focused,false,"mouse selection must not paint a keyboard focus ring");
  await waitFor("icon disclosure intermediate",()=>{
    const body=app.stage.getChildByLabel("native-disclosure:general.icons",true)?.getChildByLabel("native-disclosure-content");return Boolean(body&&body.alpha>0.05&&body.alpha<0.95);
  });
  await capture("settings-icons-expanding");
  clickWithNativeInput(app.stage.getChildByLabel("native-setting:icon-expand",true)!);
  await present("icon disclosure closing interruption");
  clickWithNativeInput(app.stage.getChildByLabel("native-setting:icon-expand",true)!);
  await waitFor("icon disclosure reopened",()=>app.stage.getChildByLabel("native-disclosure:general.icons",true)?.getChildByLabel("native-disclosure-content")?.alpha===1&&!scene.getMotionSnapshot().active);
  await capture("settings-icons-expanded");
  {const tile=app.stage.getChildByLabel(`native-setting:icon-${settings.draft.launchpadIconVariant.value}`,true) as NativeFluentButton;
    tile.hovered=true;await present("icon card hover");await capture("settings-icon-card-hover");tile.hovered=false;}
  clickWithNativeInput(app.stage.getChildByLabel("native-setting:icon-expand",true)!);
  await waitFor("icon disclosure collapsed",()=>app.stage.getChildByLabel("native-disclosure:general.icons",true)?.visible===false);
  const originalShortcut=settings.draft.mainWindowShortcut.value;
  const shortcutControl=app.stage.getChildByLabel("native-setting:shortcut",true);assert.ok(shortcutControl);
  clickWithNativeInput(shortcutControl);
  app.nativeInput.emitKey("down",{keyCode:0x77,modifiers:6});
  assert.equal(settings.draft.mainWindowShortcut.value,"control+alt+F8","native shortcut recording must reach the shared draft");
  const clearShortcut=app.stage.getChildByLabel("native-setting:clear-shortcut",true) as NativeFluentButton;
  assert.equal(clearShortcut.controlWidth,22);assert.equal(clearShortcut.controlHeight,22);assert.equal(clearShortcut.appearance,"subtle");
  await capture("settings-shortcut-clear");
  assert.equal(getRecordingShortcut(),false);
  settings.actions.setDraftMainWindowShortcut(originalShortcut);
  await present("shortcut recording settles refreshed controls");
  const languageControl=app.stage.getChildByLabel("native-setting:language",true);assert.ok(languageControl);
  clickWithNativeInput(languageControl);await present("general language menu");
  assert.ok(management.modal,"language selector must open the native menu");
  app.nativeInput.emitKey("down",{keyCode:0x1b});
  assert.ok(getSettingsShell(),"closing the language menu must retain settings");
  await present("language menu dismissed");
  const localeBefore=settings.draft.localePreference.value;
  const iconBefore=settings.draft.launchpadIconVariant.value;
  const nextLocale=localeBefore==="en-US"?"zh-CN":"en-US";
  const nextIcon=LAUNCHPAD_ICON_VARIANTS.find(value=>value!==iconBefore)!;
  const languageAgain=app.stage.getChildByLabel("native-setting:language",true)!;
  clickWithNativeInput(languageAgain);await present("language menu selection");
  const localeLabel=nativeLocaleOptions.find(option=>option.value===nextLocale)!.label;
  const languageOption=management.getChildByLabel(`native-action:${localeLabel}`,true);assert.ok(languageOption);
  clickWithNativeInput(languageOption);
  assert.equal(settings.draft.localePreference.value,nextLocale);
  settings.actions.setDraftLaunchpadIconVariant(nextIcon);
  await present("general changes ready");
  clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
  await waitFor("general settings persisted",()=>Boolean(getSettingsShell()&&!getSettingsShell()!.applying));
  const savedGeneral=(await nativeData.loadLayout())!.settings;
  assert.equal(savedGeneral.localePreference,nextLocale);
  assert.equal(savedGeneral.launchpadIconVariant,nextIcon);
  await capture("settings-general-applied");
  settings.actions.setDraftLocalePreference(localeBefore);settings.actions.setDraftLaunchpadIconVariant(iconBefore);
  await present("general restore ready");
  clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
  await (getSettingsShell() as NativeSettingsShell).waitForApply();
  await waitFor("general settings restored",()=>Boolean(getSettingsShell()&&!getSettingsShell()!.applying));
  assert.equal((await nativeData.loadLayout())!.settings.localePreference,localeBefore);
  await present("restored settings navigation hit targets");
  clickWithNativeInput(app.stage.getChildByLabel("native-settings-tab:apps",true)!);
  await waitFor("apps overview transition",()=>!scene.getMotionSnapshot().active);await present("apps overview rendered");
  await capture("settings-apps-overview");
  {
    const before=apps().persistence.capture();
    for(const root of apps().presentation.scanRoots.value)if(root.enabled)apps().toggleScanRootEnabled(root.id,false);
    await present("scan disabled");
    const scanButton=app.stage.getChildByLabel("native-apps:scan",true) as NativeFluentButton;assert.ok(scanButton.disabled);
    const scroll=scanButton.parent!.parent!.parent as import("../../rendering/native/NativeScrollView.js").NativeScrollView;
    scroll.scrollTo(scroll.maxOffset);await present("disabled scan overview");await capture("settings-apps-scan-disabled");
    apps().persistence.restore(before);await present("scan sources restored");
    for(const word of ["sample","installer","uninstall","temporary application name"]){apps().newScanKeyword.value=word;apps().addScanKeywordBlacklistItem();}
    appsPageState.keywords=true;(getSettingsShell() as NativeSettingsShell).redraw();
    await waitFor("keyword chips expanded",()=>!scene.getMotionSnapshot().active);
    const add=app.stage.getChildByLabel("native-apps:add-keyword",true)!;
    const scroller=app.stage.getChildByLabel("native-apps:manager",true)!.parent!.parent!.parent as import("../../rendering/native/NativeScrollView.js").NativeScrollView;
    scroller.reveal(scroller.content.toLocal(add.toGlobal({x:0,y:0})).y,120);await present("keyword chips");await capture("settings-apps-keyword-chips");
    const keywordField=()=>app.stage.getChildByLabel("native-apps:keyword",true) as import("../../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
    let field=keywordField();clickWithNativeInput(field);field.commitText("single-click-keyword");
    await present("keyword draft remains live");assert.equal(keywordField(),field,"typing must retain the input and Add button");
    assert.equal(apps().newScanKeyword.value,"single-click-keyword");
    clickWithNativeInput(app.stage.getChildByLabel("native-apps:add-keyword",true)!);
    await present("single click keyword added");assert.ok(apps().presentation.scanKeywordBlacklist.value.includes("single-click-keyword"));assert.equal(keywordField().value,"");
    field=keywordField();clickWithNativeInput(field);field.commitText("immediate-click-keyword");
    clickWithNativeInput(app.stage.getChildByLabel("native-apps:add-keyword",true)!);
    await present("immediate keyword click added");assert.ok(apps().presentation.scanKeywordBlacklist.value.includes("immediate-click-keyword"));
    field=keywordField();clickWithNativeInput(field);field.commitText("enter-keyword");
    app.nativeInput.emitKey("down",{keyCode:0x0d});app.nativeInput.emitKey("up",{keyCode:0x0d});
    await present("Enter keyword added");assert.ok(apps().presentation.scanKeywordBlacklist.value.includes("enter-keyword"));assert.equal(keywordField().value,"");
    await saves.flush();assert.ok((await nativeData.loadLayout())!.settings.scanKeywordBlacklist.includes("enter-keyword"));
    await capture("settings-keyword-placeholder-fixed");
    {
      const badge=()=>app.stage.getChildByLabel("native-apps:missing-badge",true)!;
      const scroll=()=>badge().parent!.parent!.parent as import("../../rendering/native/NativeScrollView.js").NativeScrollView;
      scroll().scrollTo(scroll().maxOffset);await present("apps bottom toggle before click");
      const offset=scroll().offset,position=badge().getGlobalPosition().y;
      const from=(badge() as NativeFluentToggle).transitionProgress;
      clickWithNativeInput(badge());
      await waitFor("switch animation intermediate after page rebuild",()=>{const value=(badge() as NativeFluentToggle).transitionProgress;return value>0.05&&value<0.95;});
      await capture("settings-switch-animation-middle");
      await present("switch hit geometry after asynchronous target checks");
      clickWithNativeInput(badge());
      await waitFor("switch rapid reversal settled",()=>Math.abs((badge() as NativeFluentToggle).transitionProgress-from)<0.001&&!scene.getMotionSnapshot().active);
      assert.equal(scroll().offset,offset);
      for(let repeat=0;repeat<2;repeat++){
        clickWithNativeInput(badge());await present("apps bottom toggle after click");
        assert.equal(scroll().offset,offset,"clicking the last switch must retain the bottom scroll offset");
        assert.equal(badge().getGlobalPosition().y,position,"bottom switch must stay under the pointer after redraw");
      }
      await capture("settings-apps-bottom-scroll-stable");
    }
    apps().persistence.restore(before);appsPageState.keywords=false;(getSettingsShell() as NativeSettingsShell).redraw();
    await waitFor("keyword audit restored",()=>!scene.getMotionSnapshot().active);
    const currentScroll=app.stage.getChildByLabel("native-apps:manager",true)!.parent!.parent!.parent as import("../../rendering/native/NativeScrollView.js").NativeScrollView;currentScroll.scrollTo(0);await present("source inputs revealed after audit");
  }
  {
    const shell=getSettingsShell() as NativeSettingsShell,root=apps().presentation.scanRoots.value[0]!;
    const field=app.stage.getChildByLabel(`native-apps:source-path-${root.id}`,true)!;
    const revision=shell.redrawCount;
    clickWithNativeInput(field);await present("source path focused");
    assert.equal(shell.redrawCount,revision,"focusing an unchanged source path must not rebuild settings");
    assert.equal(app.stage.getChildByLabel(`native-apps:source-path-${root.id}`,true),field,"focus must retain the input session");
    await capture("settings-source-focused");
    const sourceName=app.stage.getChildByLabel(`native-apps:source-label-${root.id}`,true) as import("../../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
    clickWithNativeInput(sourceName);sourceName.selectAll();sourceName.commitText(root.label+" test");
    clickWithNativeInput(field);await present("source blur saved without page rebuild");await saves.flush();
    assert.equal(shell.redrawCount,revision,"saving a source label while moving focus must not rebuild the page");
    assert.equal((await nativeData.loadLayout())!.settings.scanRoots[0]?.label,root.label+" test");
    clickWithNativeInput(sourceName);sourceName.selectAll();sourceName.commitText(root.label);clickWithNativeInput(field);
    await present("source label restored");await saves.flush();
  }
  for(const theme of ["dark","light"] as const){
    settings.actions.setDraftSettingsThemePreference(theme);(getSettingsShell() as NativeSettingsShell).redraw();await present(`sources ${theme}`);
    await capture(`settings-sources-${theme}`);
  }
  settings.actions.setDraftSettingsThemePreference(styleThemeBefore);(getSettingsShell() as NativeSettingsShell).redraw();await present("sources theme restored");
  {
    const savedSources=apps().persistence.capture(),savedLocale=getNativeLocale();
    try{
      setNativeLocale("zh-CN");
      const roots=createDefaultScanRoots({roots:DEFAULT_SCAN_ROOTS,translate:t}).map(root=>({...root,lastScannedAt:"2026-09-08T19:05:00.000Z"}));
      apps().persistence.restore({...savedSources,scanRoots:roots});
      for(const theme of ["dark","light"] as const){
        settings.actions.setDraftSettingsThemePreference(theme);(getSettingsShell() as NativeSettingsShell).redraw();
        await present(`default sources ${theme}`);
        for(const root of roots){
          const path=app.stage.getChildByLabel(`native-apps:source-path-${root.id}`,true)!;
          const description=app.stage.getChildByLabel(`native-apps:source-description-${root.id}`,true);
          const status=app.stage.getChildByLabel(`native-apps:source-last-scan-${root.id}`,true)!;
          const previous=description??path;
          assert.ok(status.y>=previous.y+previous.height+4,"scan metadata must clear the preceding input or description");
          if(description)assert.ok(description.y>=path.y+path.height+4,"Windows source description must clear the path input");
        }
        await capture(`settings-default-sources-${theme}`);
      }
    }finally{
      apps().persistence.restore(savedSources);setNativeLocale(savedLocale);
      settings.actions.setDraftSettingsThemePreference(styleThemeBefore);(getSettingsShell() as NativeSettingsShell).redraw();await present("default source fixtures restored");
    }
  }
  const managerLink=app.stage.getChildByLabel("native-apps:manager",true) as NativeFluentButton;
  for(let index=0;index<100&&!managerLink.focused;index++)onKey({type:"down",key:"Tab"});
  assert.ok(managerLink.focused);await present("apps manager link revealed");
  {const scroll=managerLink.parent!.parent!.parent as import("../../rendering/native/NativeScrollView.js").NativeScrollView;scroll.scrollTo(scroll.maxOffset);await present("apps overview actions");await capture("settings-apps-actions");}
  clickWithNativeInput(managerLink);
  await waitFor("apps manager transition",()=>!scene.getMotionSnapshot().active);await present("apps manager rendered");
  const firstManaged=apps().filteredManagedApps.value[0]!;
  await capture("virtual-manager-before-selection");
  {
    const list=app.stage.getChildByLabel("native-virtual-list",true) as import("../../rendering/native/ui/NativeVirtualList.js").NativeVirtualList;
    assert.ok(list.mountedCount<apps().managedApps.value.length,"only visible rows should be mounted");
    const last=list.controls.at(-1)!;last.focus(true);assert.ok(last.revealRect!().top>list.y);
    list.viewport(100000,450);assert.equal(list.mountedCount,1,"keyboard focused row must survive scrolling away");
    last.focus(false);
    const scroll=app.stage.getChildByLabel("native-apps:list-scroll",true) as import("../../rendering/native/NativeScrollView.js").NativeScrollView;
    const toolbar=app.stage.getChildByLabel("native-apps:search",true)!,toolbarY=toolbar.getGlobalPosition().y;
    scroll.scrollTo(0);list.viewport(0,450);assert.ok(list.mountedCount<=9);
    assert.equal(toolbar.getGlobalPosition().y,toolbarY,"list scrolling must not move the toolbar");
    await present("virtual scroll restored");
  }
  {
    const search=app.stage.getChildByLabel("native-apps:search",true) as typeof searchBar.input;
    const scroll=app.stage.getChildByLabel("native-apps:list-scroll",true) as import("../../rendering/native/NativeScrollView.js").NativeScrollView;
    const list=app.stage.getChildByLabel("native-virtual-list",true) as import("../../rendering/native/ui/NativeVirtualList.js").NativeVirtualList;
    const row=app.stage.getChildByLabel(`native-apps:row-${firstManaged.id}`,true);
    const shell=getSettingsShell() as NativeSettingsShell;
    const revision=shell.redrawCount;
    search.focus();search.commitText(firstManaged.name);await present("live manager search");
    assert.equal(app.stage.getChildByLabel("native-apps:search",true),search);
    assert.equal(app.stage.getChildByLabel(`native-apps:row-${firstManaged.id}`,true),row,"matching rows must survive filtering");
    search.setSelectionRange(0,Math.min(1,search.value.length));const selection={...search.selection};
    const offset=scroll.offset;apps().toggleManagedAppSelection(firstManaged.id,true);await present("local manager selection");
    assert.equal(search.focused,true);assert.deepEqual(search.selection,selection,"selection updates must preserve the live search caret");
    assert.equal(scroll.offset,offset);assert.equal(app.stage.getChildByLabel("native-apps:list-scroll",true),scroll);
    apps().appManagerSearchQuery.value="no-such-native-manager-result";await present("manager empty result");
    assert.equal(list.mountedCount,0);assert.equal(list.controls.length,0);assert.equal(search.focused,true);
    apps().appManagerSearchQuery.value="";apps().clearManagedAppSelection();await present("manager search restored");
    scroll.scrollTo(Math.min(70,scroll.maxOffset));const preservedOffset=scroll.offset;
    apps().toggleManagedAppSelection(firstManaged.id,true);await present("manager scroll preserved during selection");
    assert.equal(scroll.offset,preservedOffset);apps().clearManagedAppSelection();scroll.scrollTo(0);await present("manager local state reset");
    assert.equal(getSettingsShell(),shell);assert.equal(shell.redrawCount,revision,"search and selection must not rebuild the settings shell");
    search.blur();await waitFor("local manager controls settle",()=>!scene.getMotionSnapshot().active);
    console.log("Native manager local updates: input/caret, row reuse, empty results and shell/scroll identity passed");
  }
  clickWithNativeInput(app.stage.getChildByLabel(`native-apps:select-${firstManaged.id}`,true)!);
  await waitFor("apps selection bar expands",()=>app.stage.getChildByLabel("native-disclosure:apps.selection.apps.appManager",true)?.getChildByLabel("native-disclosure-content")?.alpha===1);
  assert.deepEqual(apps().appManagerSelectedIds.value,[firstManaged.id]);
  {
    const row=app.stage.getChildByLabel(`native-apps:row-${firstManaged.id}`,true) as NativeFluentButton;
    const exclude=app.stage.getChildByLabel("native-apps:exclude-selected",true) as NativeFluentButton;
    const remove=app.stage.getChildByLabel("native-apps:remove-selected",true) as NativeFluentButton;
    const rowRight=row.getGlobalPosition().x+row.controlWidth;
    assert.ok(Math.abs(rowRight-exclude.getGlobalPosition().x-exclude.controlWidth-10)<1,"selection actions retain the right inset");
    assert.ok(remove.getGlobalPosition().x+remove.controlWidth<=exclude.getGlobalPosition().x-7,"selection buttons keep a gap");
  }
  await capture("settings-apps-selected");
  clickWithNativeInput(app.stage.getChildByLabel("native-apps:clear",true)!);
  await waitFor("apps selection cleared",()=>apps().selectedManagedAppCount.value===0&&!scene.getMotionSnapshot().active);
  const appSettingsBefore=apps().persistence.capture();
  apps().newScanKeyword.value="native-settings-test";apps().addScanKeywordBlacklistItem();
  await present("apps keyword changed");await saves.flush();
  assert.ok((await nativeData.loadLayout())!.settings.scanKeywordBlacklist.includes("native-settings-test"));
  const newTargets=await nativeData.checkLaunchTargets([{id:"missing",launchTarget:{kind:"executable",path:join(process.env.LUMERIA_NATIVE_DATA_DIR!,"does-not-exist.exe")}}]);
  assert.equal(newTargets[0]?.status,"missing");
  apps().persistence.restore(appSettingsBefore);await present("apps settings restored");await saves.flush();
  clickWithNativeInput(app.stage.getChildByLabel("native-apps:add",true)!);
  await waitFor("apps editor transition",()=>management.getChildByLabel("native-form-overlay")?.alpha===1);
  assert.ok(management.modal);onKey({type:"down",key:"Escape"});
  await present("apps editor cancelled");
  assert.deepEqual(layoutState.presentation.pages.value,baselinePages,"cancelled app editor cannot alter layout");
  const managerSearch=app.stage.getChildByLabel("native-apps:search",true) as import("../../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
  managerSearch.focus();managerSearch.selectAll();managerSearch.commitText("No matching application");
  await waitFor("apps search filters",()=>apps().filteredManagedApps.value.length===0);await present("apps empty search");
  assert.equal(searchBar.host.focused?.value,"No matching application","live search redraw must preserve focused text");
  searchBar.host.focused!.selectAll();searchBar.host.focused!.commitText("");await waitFor("apps search restores",()=>apps().filteredManagedApps.value.length===apps().managedApps.value.length);
  await present("apps search restored");
  assert.ok(apps().canExcludeManagedAppFromScan(firstManaged));apps().excludeManagedAppFromScan(firstManaged);
  await present("app excluded");await saves.flush();assert.equal(apps().managedApps.value.some(item=>item.id===firstManaged.id),false);
  navigation.openSubPage(navigation.settingsSubPages.value.appsExcludedApps!);(getSettingsShell() as NativeSettingsShell).redraw();
  await waitFor("excluded page transition",()=>!scene.getMotionSnapshot().active);await present("excluded page rendered");
  await capture("settings-apps-excluded");
  clickWithNativeInput(app.stage.getChildByLabel(`native-apps:restore-${firstManaged.id}`,true)!);await present("exclusion removed");await saves.flush();
  assert.equal(apps().presentation.scanAppBlacklist.value.length,appSettingsBefore.scanAppBlacklist.length);
  await apps().rescanManagedApps();
  await waitFor("scan result modal",()=>management.activeId==="scan-results");await present("scan results rendered");
  assert.ok(apps().scanResultModel.apps.value.some(item=>item.id===firstManaged.id));await capture("settings-apps-scan-results");
  {
    const dialogs=appDialogs()!;
    const saveNormally=dialogs.options.save;
    dialogs.options.save=async()=>{throw new Error("smoke: scan save unavailable");};
    try{
      clickWithNativeInput(management.getChildByLabel("native-modal:scan-results:confirm",true)!);
      await present("scan save failure retained");
      assert.equal(apps().scanResultModel.isOpen.value,true,"scan persistence failure must retain its model and dialog");
      assert.equal(management.activeId,"scan-results");
      await capture("scan-save-failure");
    }finally{dialogs.options.save=saveNormally;}
    clickWithNativeInput(management.getChildByLabel("native-modal:scan-results:confirm",true)!);
    await waitFor("scan selection saved after retry",()=>!management.modal);await present("scan selection added");await saves.flush();
    assert.equal(apps().managedApps.value.filter(item=>item.id===firstManaged.id).length,1,"retry must not append the scanned app twice");
  }
  assert.ok(apps().managedApps.value.some(item=>item.id===firstManaged.id));
  apps().persistence.restore(appSettingsBefore);commitEditedPages(baselinePages);await present("apps roundtrip fixture restored");await saves.flush();
  console.log("Native apps settings: overview, multi-selection animation, persistence, target checks and editor cancellation passed");

  const appearanceTab=app.stage.getChildByLabel("native-settings-tab:interface",true);assert.ok(appearanceTab);
  clickWithNativeInput(appearanceTab);await present("back to native layout settings");
  const committedTheme=settings.persistence.capture().settingsThemePreference;
  const previewTheme=settingsTheme()==="dark"?"light":"dark";
  clickWithNativeInput(app.stage.getChildByLabel(`native-setting:theme-${previewTheme}`,true)!);
  await present("settings theme preview");
  assert.equal(settingsTheme(),previewTheme);
  assert.equal(settings.persistence.capture().settingsThemePreference,committedTheme,"theme preview must not commit settings");
  await capture("settings-theme-preview");
  for(const theme of ["dark","light"] as const){
    settings.actions.setDraftSettingsThemePreference(theme);(getSettingsShell() as NativeSettingsShell).redraw();await present(`segment ${theme}`);
    const selected=app.stage.getChildByLabel(`native-setting:theme-${theme}`,true) as NativeFluentButton;
    selected.hovered=true;await present("selected segment hover");await capture(`settings-segment-${theme}-selected-hover`);selected.hovered=false;
    const middle=app.stage.getChildByLabel("native-setting:theme-light",true) as NativeFluentButton;
    middle.hovered=true;await present("middle segment hover");await capture(`settings-segment-${theme}-middle-hover`);middle.hovered=false;
  }
  settings.actions.setDraftSettingsThemePreference(committedTheme);(getSettingsShell() as NativeSettingsShell|null)?.redraw();
  await present("settings theme restored");

  const clickWindowControl=async(label:string)=>{
    const control=app.stage.getChildByLabel(`native-window:${label}`,true);assert.ok(control instanceof NativeFluentButton);
    for(let index=0;index<160&&!control.focused;index++)onKey({type:"down",key:"Tab"});
    assert.ok(control.focused,`window settings keyboard must reach ${label}`);
    await present(`window ${label} revealed`);clickWithNativeInput(control);await present(`window ${label} selected`);
  };
  const windowBefore=app.getWindowFrame(),materialBefore=settings.presentation.windowEffectMaterial.value;
  const modeRow=app.stage.getChildByLabel("native-window:mode-expand",true) as NativeFluentButton;
  const arrowPoint=modeRow.toGlobal({x:modeRow.controlWidth-25,y:36});
  assert.equal(app.renderer.events.rootBoundary.hitTest(arrowPoint.x,arrowPoint.y),modeRow,"mode arrow must hit the whole-row expander");
  const applyWindowSettings=async()=>{
    clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
    await waitFor("window settings transaction completed",()=>Boolean(getSettingsShell()&&!getSettingsShell()!.applying));
    await present("window settings presentation settled");
  };
  const titlebarBefore=settings.presentation.showCustomTitlebar.value;
  await clickWindowControl("mode-expand");
  {
    const themeBefore=settings.draft.settingsThemePreference.value,modeBefore=settings.draft.windowMode.value;
    settings.actions.setDraftSettingsThemePreference("dark");
    for(const mode of ["windowed","fullscreen"] as const){
      settings.actions.setDraftWindowMode(mode);(getSettingsShell() as NativeSettingsShell).redraw();
      await waitFor("window disclosure settles",()=>!scene.getMotionSnapshot().active);await present(`window disclosure ${mode}`);
      const detailRow=app.stage.getChildByLabel("native-window:titlebar-row",true)!;
      assert.equal(detailRow.alpha,mode==="fullscreen"?0.68:1);
      const disclosure=app.stage.getChildByLabel("native-disclosure:window.mode",true)!;
      const header=app.stage.getChildByLabel("native-window:mode-expand",true)!;
      assert.ok(Math.abs(disclosure.y-header.y-72)<0.01,"header and detail must share a seam without a row gap");
      await capture(`settings-window-disclosure-${mode}`);
    }
    settings.actions.setDraftWindowMode(modeBefore);settings.actions.setDraftSettingsThemePreference(themeBefore);(getSettingsShell() as NativeSettingsShell).redraw();await present("window disclosure draft restored");
  }
  const toggleTitlebar=async()=>{
    await clickWindowControl("windowed");
    onKey({type:"down",key:"Tab"});await present("titlebar toggle revealed");
    const toggle=app.stage.getChildByLabel("native-window:titlebar",true);assert.ok(toggle instanceof NativeFluentToggle);
    clickWithNativeInput(toggle);await applyWindowSettings();
  };
  if(!titlebarBefore)await toggleTitlebar();
  assert.equal(settings.presentation.showCustomTitlebar.value,true);
  assert.equal((await nativeData.loadLayout())!.settings.showCustomTitlebar,true);
  assert.ok(windowChrome.getChildByLabel("native-window-chrome:close"),"custom titlebar must expose a close action");
  await capture("settings-titlebar");
  {
    const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
    const handle=getNativePixiApplicationTesting(app).handles().inputWindow;
    const caption=windowChrome.getChildByLabel("native-window-chrome:close");assert.ok(caption);
    clickWithNativeInput(caption);
    await waitFor("caption X starts hiding",()=>launchFlow.isDesktopClosing.value);
    assert.equal((await captureOwnedWindow(handle)).material,1,"closing begins by removing the Windows material");
    await waitFor("caption X hides without exiting",()=>!app.window.isVisible());
    assert.equal(app.state,"running");assert.ok(tray()?.id,"X must retain the tray");
    context.showLaunchpad();await waitFor("caption X reopen settles",()=>app.window.isVisible()&&scene.getDesktopAlpha()>0.99&&!scene.getMotionSnapshot().active);
    openSettings();await present("settings reopened after X");
    await captureOwnedWindow(handle,join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"caption-system.png"));
    const beforeMaximize={...app.contentSize};
    const maximize=windowChrome.getChildByLabel("native-window-chrome:maximize");assert.ok(maximize);
    clickWithNativeInput(maximize);await waitFor("caption maximize",()=>app.window.isMaximized());await present("maximized caption settled");
    await waitFor("restore caption presented and hit-testable",()=>{
      const control=windowChrome.getChildByLabel("native-window-chrome:restore");if(!control)return false;
      const point=control.toGlobal({x:21,y:22});return app.renderer.events.rootBoundary.hitTest(point.x,point.y)===control;
    });
    const restore=windowChrome.getChildByLabel("native-window-chrome:restore");assert.ok(restore);
    clickWithNativeInput(restore);await waitFor("caption restore",()=>!app.window.isMaximized()&&app.contentSize.width===beforeMaximize.width&&app.contentSize.height===beforeMaximize.height);
    await present("restored caption settled");
    console.log("Caption X hides and preserves tray; close begins with DWM material disabled");
  }
  if(process.env.LAUNCHPAD_NATIVE_WINDOW_INPUT_SMOKE==="1"){
    const {getNativePixiApplicationTesting}=await import("../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js");
    const testing=getNativePixiApplicationTesting(app),handle=testing.handles().inputWindow;
    const screenPoint=(x:number,y:number)=>testing.clientToScreen(
      Math.round(x*testing.diagnostics().window.snapshot.scaleFactor),Math.round(y*testing.diagnostics().window.snapshot.scaleFactor));
    const initial={...app.window.getFrame()},initialContent={...app.contentSize};
    const restoreWindow=async()=>{
      await waitFor("OS move/size capture released",()=>!testing.diagnostics().input.captured&&!testing.diagnostics().input.nativeCaptured);
      app.window.setSize(initial.width,initial.height);app.window.setPosition(initial.x,initial.y);
      await waitFor("window restored after OS drag",()=>{
        const frame=app.window.getFrame();return Math.abs(frame.x-initial.x)<2&&Math.abs(frame.y-initial.y)<2
          &&Math.abs(frame.width-initial.width)<2&&Math.abs(frame.height-initial.height)<2
          &&Math.abs(app.contentSize.width-initialContent.width)<1&&Math.abs(app.contentSize.height-initialContent.height)<1;
      });
      await present("restored window geometry after OS drag");
    };
    const beforeDrag=app.getWindowFrame();
    testing.resetInputEvents();
    await dragOwnedNativeWindow(handle,screenPoint(100,20),{x:30,y:24});
    console.log("Native OS titlebar observation",JSON.stringify({before:beforeDrag,after:app.getWindowFrame()}));
    await waitFor("titlebar drag moves the actual HWND",()=>Math.abs(app.getWindowFrame().x-beforeDrag.x)>10);
    await restoreWindow();
    for(const direction of ["North","South","West","East","NorthWest","NorthEast","SouthWest","SouthEast"]){
      const edge=windowChrome.getChildByLabel(`native-window-resize:${direction}`);assert.ok(edge);
      const area=edge.hitArea as Rectangle;
      const point=edge.toGlobal({x:area.x+area.width/2,y:area.y+area.height/2});
      const delta={x:direction.includes("West")?18:direction.includes("East")?-18:0,
        y:direction.includes("North")?18:direction.includes("South")?-18:0};
      const before=app.getWindowFrame();
      assert.equal(app.renderer.events.rootBoundary.hitTest(point.x,point.y),edge,`${direction} resize handle must own its actual coordinates`);
      try{await dragOwnedNativeWindow(handle,screenPoint(point.x,point.y),delta);}
      catch(error){console.error("Native OS resize failure",direction,testing.diagnostics().input);throw error;}
      console.log("Native OS resize observation",direction,JSON.stringify({before,after:app.getWindowFrame(),point}));
      await waitFor(`actual ${direction} resize`,()=>{
        const frame=app.getWindowFrame();return (delta.x===0||frame.width<before.width-8)&&(delta.y===0||frame.height<before.height-8);
      });
      await restoreWindow();
    }
    console.log("Native window OS input: titlebar drag and all eight resize directions passed");
  }
  // Exercise the actual close guard while a settings transaction is in flight.
  const applyingShell=getSettingsShell() as NativeSettingsShell;
  const applyNormally=applyingShell.options.apply;
  {
    const applyButton=app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true) as NativeFluentButton;
    const cancelButton=app.stage.getChildByLabel(`native-action:${t("common.actions.cancel")}`,true)!;
    let finish!:()=>void,calls=0;
    applyingShell.options.apply=()=>{calls++;return new Promise<void>(resolve=>{finish=resolve;});};
    try{
      clickWithNativeInput(applyButton);
      const p=applyButton.toGlobal({x:44,y:17});
      for(let click=0;click<12;click++){app.nativeInput.emitPointer("pointerdown",p.x,p.y,0);app.nativeInput.emitPointer("pointerup",p.x,p.y,0);}
      assert.equal(calls,1);assert.equal(applyButton.disabled,false);assert.equal(applyingShell.closing,false);
      app.nativeInput.emitPointer("pointerdown",p.x,p.y,0);finish();await applyingShell.waitForApply();
      app.nativeInput.emitPointer("pointerup",p.x,p.y,0);await present("rapid apply across save completion");
      if(applyingShell.applying){finish();await applyingShell.waitForApply();}
      assert.equal(getSettingsShell(),applyingShell);assert.equal(applyingShell.closing,false);
      assert.equal(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true),applyButton);
      assert.equal(app.stage.getChildByLabel(`native-action:${t("common.actions.cancel")}`,true),cancelButton);
      await capture("settings-rapid-apply-stable");
      console.log("Rapid apply: duplicate save blocked, footer nodes preserved, no settings close");
    }finally{applyingShell.options.apply=applyNormally;}
  }
  let rejectPending!:(error:Error)=>void;
  applyingShell.options.apply=()=>new Promise<void>((_resolve,reject)=>{rejectPending=reject;});
  try{
    const beforeApply=applyingShell.redrawCount;
    clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
    assert.ok(applyingShell.applying);
    assert.equal(applyingShell.redrawCount,beforeApply,"pending apply must preserve the rendered controls");
    await present("pending apply visual");await capture("settings-apply-pending");
    requestQuit();
    await waitFor("close waits for settings",()=>isWindowClosing());
    assert.equal(app.state,"running");assert.equal(app.stage.interactiveChildren,false);
    rejectPending(new Error("smoke: settings apply failure must retain the window"));
    await waitFor("failed apply restores window input",()=>!isWindowClosing()&&!applyingShell.applying);
    assert.equal(app.state,"running");assert.equal(app.stage.interactiveChildren,true);
  }finally{applyingShell.options.apply=applyNormally;notices.closeTransientNotice();}
  await applyWindowSettings();
  console.log("Native close guard: pending settings wait, failure retention and retry passed");
  await toggleTitlebar();
  assert.equal(settings.presentation.showCustomTitlebar.value,false);
  assert.equal(windowChrome.getChildByLabel("native-window-chrome:close"),null,"titlebar off must remove its controls");
  assert.ok(windowChrome.getChildByLabel("native-window-drag"),"titlebar off must retain the drag strip");
  if(titlebarBefore)await toggleTitlebar();
  windowPanelState.mode=false;(getSettingsShell() as NativeSettingsShell|null)?.redraw();
  await present("titlebar settings restored");
  await clickWindowControl("material-expand");
  if(settings.actions.canUseWindowEffectMaterial("mica")){
    await clickWindowControl("preview-mica");
    await applyWindowSettings();
    assert.equal((await nativeData.loadLayout())!.settings.windowEffectMaterial,"mica");
  }
  await capture("settings-window-material");
  for(const theme of ["dark","light"] as const){
    settings.actions.setDraftSettingsThemePreference(theme);(getSettingsShell() as NativeSettingsShell|null)?.redraw();
    await present(`window settings ${theme} theme`);
    await capture(`settings-window-${theme}`);
  }
  settings.actions.setDraftSettingsThemePreference(committedTheme);(getSettingsShell() as NativeSettingsShell|null)?.redraw();
  await present("window theme restored after comparison");
  await clickWindowControl("fullscreen");await applyWindowSettings();
  assert.equal(app.windowMode,"fullscreen");
  assert.equal((await nativeData.loadLayout())!.settings.windowMode,"fullscreen");
  assert.ok(app.getWindowFrame().width>=windowBefore.width);
  await capture("settings-window-fullscreen");
  await clickWindowControl("windowed");settings.actions.setDraftWindowEffectMaterial(materialBefore);await applyWindowSettings();
  assert.equal(app.windowMode,"windowed");
  assert.deepEqual(app.getWindowFrame(),windowBefore,"window settings must restore the previous physical frame");
  windowPanelState.material=false;(getSettingsShell() as NativeSettingsShell|null)?.redraw();
  await present("window settings restored");

  const clickBackgroundControl=async(label:string)=>{
    const control=app.stage.getChildByLabel(`native-background:${label}`,true);
    assert.ok(control instanceof NativeFluentButton);
    for(let index=0;index<100&&!control.focused;index++)onKey({type:"down",key:"Tab"});
    assert.ok(control.focused,`keyboard must reach ${label}`);
    await present(`background ${label} revealed`);clickWithNativeInput(control);
    await present(`background ${label} selected`);
  };
  const originalPickerColor=settings.draft.backgroundBaseColor.value;
  const pickerLocale=getNativeLocale();setNativeLocale("zh-CN");
  for(const accept of [true,false]){
    settings.actions.setDraftSettingsThemePreference(accept?"dark":"light");(getSettingsShell() as NativeSettingsShell|null)?.redraw();
    const beforeColor=settings.draft.backgroundBaseColor.value;
    await clickBackgroundControl("base-color-picker");
    assert.equal(management.activeId,"color-picker");
    const field=management.getChildByLabel("native-color:hex",true) as import("../../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
    clickWithNativeInput(field);field.selectAll();field.commitText("#336699");
    await capture(accept?"native-color-picker-dark":"native-color-picker-light");
    clickWithNativeInput(management.getChildByLabel(accept?"native-modal:color-picker:confirm":"native-modal:color-picker:cancel",true)!);
    await waitFor("native color picker released",()=>!management.modal);
    await present("color applied to draft");
    assert.equal(settings.draft.backgroundBaseColor.value,accept?"#336699":beforeColor);
  }
  const pickerColorInput=app.stage.getChildByLabel("native-background:base-color",true) as import("../../../vendor/electrobun-pixi-native-starter/src/native-host.js").TextInput;
  pickerColorInput.value=originalPickerColor;
  settings.actions.setDraftBackgroundBaseColor(originalPickerColor);
  settings.actions.setDraftSettingsThemePreference(committedTheme);(getSettingsShell() as NativeSettingsShell|null)?.redraw();
  setNativeLocale(pickerLocale);
  console.log("Native color picker: custom HEX confirmation and cancellation passed");
  {
    const initial=settings.draft.backgroundBaseColor.value;
    let finishColor!:(value:number|null)=>void;
    const createColorPage=()=>nativeBackgroundSettings({settings,host:searchBar.host,renderer:app.renderer,width:700,
      size:app.contentSize,theme:settingsTheme(),systemAppearance:context.systemAppearance(),state:{layer:false,effect:false,profile:context.systemAppearance(),error:""},
      invalidate:()=>{},redraw:()=>{},chooseColor:()=>new Promise(resolve=>{finishColor=resolve;})});
    const accepted=createColorPage();
    (accepted.node.getChildByLabel("native-background:base-color-picker",true) as NativeFluentButton).activate();
    finishColor(0x123456);await Promise.resolve();
    assert.equal(settings.draft.backgroundBaseColor.value,"#123456","selected color must reach the shared draft");
    accepted.dispose();accepted.node.destroy({children:true});
    const cancelled=createColorPage();
    (cancelled.node.getChildByLabel("native-background:base-color-picker",true) as NativeFluentButton).activate();
    finishColor(null);await Promise.resolve();assert.equal(settings.draft.backgroundBaseColor.value,"#123456");
    cancelled.dispose();cancelled.node.destroy({children:true});
    const stale=createColorPage();
    (stale.node.getChildByLabel("native-background:base-color-picker",true) as NativeFluentButton).activate();
    stale.dispose();stale.node.destroy({children:true});
    settings.actions.setDraftBackgroundBaseColor(initial);
    finishColor(0xff0000);await Promise.resolve();
    assert.equal(settings.draft.backgroundBaseColor.value,initial,"disposed color selection must not mutate the next draft");
  }
  await clickBackgroundControl("layer-expand");
  settings.draft.backgroundImagePath.value=cachedBackground.imagePath;
  await clickBackgroundControl("source-customImage");
  await clickBackgroundControl("layout-fit");
  assert.equal(settings.draft.backgroundImageLayout.value,"fit");
  assert.equal(settings.persistence.capture().backgroundImagePath,backgroundBaseline.backgroundImagePath,"preview must not commit the image");
  await waitFor("background layer preview loaded",()=>app.stage.getChildByLabel("native-background-preview:layer",true)?.visible===true);
  await present("background layer preview ready");
  await capture("settings-background-layer");
  await clickBackgroundControl("effect-expand");
  await clickBackgroundControl("effect-acrylic");
  await clickBackgroundControl("appearance-light");
  await waitFor("background effect preview loaded",()=>app.stage.getChildByLabel("native-background-preview:effect",true)?.visible===true);
  await present("background effect preview ready");
  await capture("settings-background-effect");
  for(const theme of ["dark","light"] as const){
    settings.actions.setDraftSettingsThemePreference(theme);(getSettingsShell() as NativeSettingsShell|null)?.redraw();
    await waitFor("theme background preview loaded",()=>app.stage.getChildByLabel("native-background-preview:effect",true)?.visible===true);
    await present(`background settings ${theme} theme`);
    await capture(`settings-background-${theme}`);
  }
  settings.actions.setDraftSettingsThemePreference(committedTheme);(getSettingsShell() as NativeSettingsShell|null)?.redraw();
  await present("background theme restored after comparison");
  await clickBackgroundControl("profile-light");
  for(let index=0;index<4;index++)onKey({type:"down",key:"Tab"});
  await present("acrylic brightness control revealed");
  onKey({type:"down",key:"End"});
  assert.equal(settings.draft.backgroundAcrylicLightParams.value.brightness,1.2,"brightness keyboard control must use the original UI range");
  onKey({type:"down",key:"Tab"});onKey({type:"down",key:"End"});
  assert.equal(settings.draft.backgroundAcrylicLightParams.value.contrast,1.25,"contrast control must reach the shared profile");
  await present("acrylic parameter controls settled");await capture("settings-acrylic-parameters");
  clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
  await waitFor("background applied",()=>Boolean(getSettingsShell()&&!getSettingsShell()!.applying));
  const savedBackground=(await nativeData.loadLayout())!.settings;
  assert.equal(savedBackground.backgroundImagePath,cachedBackground.imagePath);
  assert.equal(savedBackground.backgroundImageLayout,"fit");
  assert.equal(savedBackground.backgroundEffect,"acrylic");
  assert.equal(savedBackground.backgroundAcrylicLightParams.brightness,1.2);
  assert.equal(savedBackground.backgroundAcrylicLightParams.contrast,1.25);
  settings.actions.clearDraftBackgroundImage();
  clickWithNativeInput(app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true)!);
  await waitFor("background cleared",()=>Boolean(getSettingsShell()&&!getSettingsShell()!.applying));
  assert.equal((await nativeData.loadLayout())!.settings.backgroundImagePath,null);
  backgroundPanelState.layer=backgroundPanelState.effect=false;
  (getSettingsShell() as NativeSettingsShell).redraw();await present("collapsed background rows");
  {
    const layer=app.stage.getChildByLabel("native-background:layer-expand",true) as NativeFluentButton;
    let ancestor=layer.parent;
    while(ancestor&&!(ancestor instanceof NativeScrollView))ancestor=ancestor.parent;
    assert.ok(ancestor instanceof NativeScrollView,"background rows must belong to the settings scroll view");
    const scroll=ancestor;
    scroll.scrollTo(scroll.content.toLocal(layer.toGlobal({x:0,y:0})).y-110);
    await present("background text column alignment");await capture("settings-background-aligned");
  }
  (getSettingsShell() as NativeSettingsShell|null)?.redraw();await present("background sections collapsed");
  // A missing image must leave the committed document and desktop usable for retry.
  {
    const before=settings.persistence.capture();
    settings.draft.backgroundImagePath.value=join(process.env.LUMERIA_NATIVE_DATA_DIR!,"missing-settings-background.png");
    settings.actions.setDraftBackgroundSource("customImage");
    await applyWindowSettings();
    assert.deepEqual(settings.persistence.capture(),before,"failed background preparation must not commit the draft");
    assert.equal((await nativeData.loadLayout())!.settings.backgroundImagePath,before.backgroundImagePath);
    assert.ok((getSettingsShell() as NativeSettingsShell).children.length>0,"settings must remain open after background failure");
    settings.actions.clearDraftBackgroundImage();await applyWindowSettings();
  }

  const showCompact=async()=>{
    const compact=app.stage.getChildByLabel("native-setting:compact",true);assert.ok(compact instanceof NativeFluentButton);
    for(let index=0;index<160&&!compact.focused;index++)onKey({type:"down",key:"Tab"});
    assert.ok(compact.focused);await present("compact control revealed");
    clickWithNativeInput(compact);await present("compact confirmation visible");
    assert.ok(management.modal);
  };
  await showCompact();
  await waitFor("compact confirmation animation settled",()=>management.getChildByLabel("native-form-overlay")?.alpha===1);
  await present("compact confirmation settled frame");await capture("settings-compact-confirm");
  onKey({type:"down",key:"Escape"});
  assert.deepEqual(layoutState.presentation.pages.value,baselinePages,"cancelled compact must retain page boundaries");
  await waitFor("compact cancellation settled",()=>!management.modal);await present("compact cancellation settled");await showCompact();
  const confirmCompact=management.getChildByLabel("native-modal:warning:confirm",true);assert.ok(confirmCompact);
  clickWithNativeInput(confirmCompact);await waitFor("compacted layout saved",()=>!management.modal);
  assert.deepEqual(layoutState.presentation.pages.value.flat().map(item=>item.id),baselinePages.flat().map(item=>item.id));
  assert.equal(layoutState.presentation.pages.value.length,Math.ceil(baselinePages.flat().length/layoutState.presentation.pageSize.value));
  assert.deepEqual((await nativeData.loadLayout())!.pages.map(page=>page.map(item=>item.id)),
    layoutState.presentation.pages.value.map(page=>page.map(item=>item.id)),"saved page boundaries and order must match the compacted layout");
  commitEditedPages(baselinePages);await saves.flush();await present("compact fixture restored");
  console.log("Native settings compact: confirmation, cancellation, item order and persisted layout passed");

  const rowsControl=app.stage.getChildByLabel("native-setting:desktopRows",true);
  assert.ok(rowsControl);
  for(let index=0;index<60&&!(rowsControl as import("../../rendering/native/NativeSpinButton.js").NativeSpinButton).input.focused;index++)onKey({type:"down",key:"Tab"});
  assert.ok((rowsControl as import("../../rendering/native/NativeSpinButton.js").NativeSpinButton).input.focused,"Tab must reveal and focus the desktop row input");
  await present("desktop row focus scroll settled");
  onKey({type:"down",key:"ArrowUp"});
  assert.equal(layoutSettings.draftRows.value,baselineConfig.rows+1,"numeric keyboard handling must reach the shared draft");
  onKey({type:"down",key:"ArrowDown"});
  const increase=rowsControl.getChildByLabel("native-action:+",true);assert.ok(increase);
  clickWithNativeInput(increase);
  assert.equal(layoutSettings.draftRows.value,baselineConfig.rows+1);
  assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows,"draft edits must not change desktop configuration");
  onKey({type:"down",key:"Escape"});
  await waitFor("settings close animation complete",()=>getSettingsShell()===null);
  assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows,"Cancel must retain the committed configuration");
  await present("settings close restores entry hit target");
  {
    let noticeActions=0;
    notices.showTransientNotice({title:"Temporary",message:"Replaced notice",durationMs:60});
    notices.showTransientNotice({title:"Layout could not be saved",message:"Your changes are kept in this session. Retry saving when the destination is available.",detail:"Smoke fixture: a deliberately unavailable destination.",intent:"error",actionText:"Retry",onAction:()=>{noticeActions++;}});
    await new Promise<void>(resolve=>setTimeout(resolve,90));await present("persistent notice replaces timer");
    assert.equal(noticeView.visible,true,"replacing a timed notice must cancel its previous timer");
    await capture("notice-error-action");
    clickWithNativeInput(noticeView.getChildByLabel("native-notice:action",true)!);assert.equal(noticeActions,1);
    searchBar.input.blur();onKey({type:"down",key:"Tab"});assert.equal(noticeView.hasFocus,true);
    onKey({type:"down",key:"Enter"});assert.equal(noticeActions,2,"notice action must be reachable from desktop keyboard navigation");
    onKey({type:"down",key:"Tab"});onKey({type:"down",key:"Tab"});assert.equal(noticeView.hasFocus,false,"notification keyboard navigation must return to the desktop");searchBar.input.blur();
    clickWithNativeInput(noticeView.getChildByLabel("native-notice:close",true)!);await present("notice dismissed");assert.equal(noticeView.visible,false);
    notices.showTransientNotice({title:"Saved",message:"The latest layout is saved.",intent:"success",durationMs:60});
    await waitFor("notice expires",()=>!noticeView.visible);
    await present("notice expiry restores desktop hit targets");
    assert.equal(launchFlow.isDesktopOpen.value,true,"notice clicks must not enter the desktop blank-click dismissal gesture");
    await capture("notice-expired-desktop");await present("notice desktop presented");
  }
  clickWithNativeInput(settingsButton);await present("settings reopened");
  const reopenedRows=app.stage.getChildByLabel("native-setting:desktopRows",true);assert.ok(reopenedRows);
  for(let index=0;index<60&&!(reopenedRows as import("../../rendering/native/NativeSpinButton.js").NativeSpinButton).input.focused;index++)onKey({type:"down",key:"Tab"});
  await present("reopened desktop row revealed");
  clickWithNativeInput(reopenedRows.getChildByLabel("native-action:+",true)!);
  const typedSize=app.stage.getChildByLabel("native-setting:iconSize",true) as import("../../rendering/native/NativeSpinButton.js").NativeSpinButton;
  assert.ok(typedSize);
  for(let index=0;index<60&&!typedSize.input.focused;index++)onKey({type:"down",key:"Tab"});
  await present("icon size input revealed");
  clickWithNativeInput(typedSize.input);
  assert.equal(typedSize.input.focused,true,"mouse click must preserve numeric input focus");
  typedSize.input.selectAll();typedSize.input.commitText("128");
  const applyButton=app.stage.getChildByLabel(`native-action:${t("common.actions.apply")}`,true);assert.ok(applyButton);
  clickWithNativeInput(applyButton);
  await waitFor("settings applied and persisted",()=>Boolean(getSettingsShell()&&!getSettingsShell()!.applying));
  assert.equal(layoutState.captureConfiguration().rows,baselineConfig.rows+1);
  assert.equal((await nativeData.loadLayout())?.settings.gridRows,baselineConfig.rows+1);
  assert.equal(layoutState.captureConfiguration().iconSize,128,"typing then clicking Apply must commit numeric text");
  assert.equal((await nativeData.loadLayout())?.settings.iconSize,128);
  for(let index=0;index<12;index++)onKey({type:"down",key:"Tab"});
  await present("settings keyboard scrolled content");
  await capture("settings-layout-keyboard");
  onKey({type:"down",key:"Escape"});
  await restoreCommittedLayout(baselineConfig,baselinePages);
  await waitFor("settings restored layout settled",()=>!scene.getMotionSnapshot().active);
  await present("settings restoration complete");
}
