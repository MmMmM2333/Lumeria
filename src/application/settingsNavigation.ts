import type { StateHost } from "./stateHost.js";
const SETTINGS_ROUTE_TRANSITION_FORWARD = "settings-route-forward";
const SETTINGS_ROUTE_TRANSITION_BACK = "settings-route-back";
const SETTINGS_ROUTE_TRANSITION_SWITCH = "settings-route-switch";
export const SETTINGS_TAB_SPECS = Object.freeze([
  Object.freeze({ id: "general", labelKey: "settings.general.title" }),
  Object.freeze({ id: "interface", labelKey: "settings.interface.title" }),
  Object.freeze({ id: "apps", labelKey: "settings.apps.title" }),
  Object.freeze({ id: "about", labelKey: "settings.about.title" }),
] as const);

export const SETTINGS_SUBPAGE_SPECS = Object.freeze({
  appsExcludedApps: Object.freeze({ id: "apps.excludedApps", labelKey: "settings.apps.excluded.title", parentTabId: "apps" }),
  appsAppManager: Object.freeze({ id: "apps.appManager", labelKey: "settings.apps.manager.title", parentTabId: "apps" }),
});

export type SettingsTabId = (typeof SETTINGS_TAB_SPECS)[number]["id"];
export type SettingsTabItem = Readonly<{ id: SettingsTabId; label: string }>;
export type SettingsSubPageSpec = Readonly<{
  id: string;
  labelKey: string;
  parentTabId: SettingsTabId;
}>;
export type SettingsSubPageItem = SettingsSubPageSpec & Readonly<{ label: string }>;

export function createSettingsNavigation(host:StateHost,t:(key:string)=>string){
  const {cell:ref,derived:computed}=host;
  const activeTab = ref<SettingsTabId>("general");
  const activeSubPage = ref<SettingsSubPageSpec | null>(null);
  const isNavigationCompact = ref(true);
  const routeTransitionName = ref(SETTINGS_ROUTE_TRANSITION_SWITCH);

  const settingsTabs = computed<SettingsTabItem[]>(() => (
    SETTINGS_TAB_SPECS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))
  ));
  const settingsSubPages = computed(() => Object.fromEntries(
    Object.entries(SETTINGS_SUBPAGE_SPECS).map(([name, page]) => [name, {
      id: page.id,
      label: t(page.labelKey),
      labelKey: page.labelKey,
      parentTabId: page.parentTabId,
    }]),
  ));
  const activeTabItem = computed(() => (
    settingsTabs.value.find((tab) => tab.id === activeTab.value) || settingsTabs.value[0]!
  ));
  const activeRoute = computed(() => {
    const tab = activeTabItem.value;
    const subPage = activeSubPage.value?.parentTabId === tab.id ? activeSubPage.value : null;
    return {
      depth: subPage ? 1 : 0,
      key: subPage ? `${tab.id}/${subPage.id}` : `${tab.id}/index`,
      label: subPage?.labelKey ? t(subPage.labelKey) : tab.label,
      parentLabel: tab.label,
      subPageId: subPage?.id || null,
      tabId: tab.id,
    };
  });

  function resolveRouteTransition(
    nextTabId: SettingsTabId,
    nextSubPage: SettingsSubPageSpec | null,
  ): string {
    if (nextTabId !== activeTab.value) return SETTINGS_ROUTE_TRANSITION_SWITCH;
    const currentDepth = activeSubPage.value ? 1 : 0;
    const nextDepth = nextSubPage ? 1 : 0;
    if (nextDepth > currentDepth) return SETTINGS_ROUTE_TRANSITION_FORWARD;
    if (nextDepth < currentDepth) return SETTINGS_ROUTE_TRANSITION_BACK;
    if (nextSubPage?.id !== activeSubPage.value?.id) return SETTINGS_ROUTE_TRANSITION_SWITCH;
    return routeTransitionName.value;
  }

  function updateRoute(tabId: SettingsTabId, subPage: SettingsSubPageSpec | null): boolean {
    if (!SETTINGS_TAB_SPECS.some((tab) => tab.id === tabId)) return false;
    const nextSubPage = subPage ? normalizeSettingsSubPage(subPage) : null;
    if (nextSubPage && nextSubPage.parentTabId !== tabId) return false;
    routeTransitionName.value = resolveRouteTransition(tabId, nextSubPage);
    activeSubPage.value = nextSubPage;
    activeTab.value = tabId;
    return true;
  }

  function selectTab(tabId: SettingsTabId): void {
    updateRoute(tabId, null);
  }

  function openSubPage(page: SettingsSubPageSpec): void {
    const next = normalizeSettingsSubPage(page);
    if (next) updateRoute(next.parentTabId, next);
  }

  function normalizeSettingsSubPage(page: SettingsSubPageSpec | null | undefined): SettingsSubPageSpec | null {
    if (!page?.id || !page?.labelKey || !page?.parentTabId) return null;
    if (!SETTINGS_TAB_SPECS.some((tab) => tab.id === page.parentTabId)) return null;
    return { id: page.id, labelKey: page.labelKey, parentTabId: page.parentTabId };
  }

  function closeSubPage() {
    if (activeSubPage.value) updateRoute(activeTab.value, null);
  }


  return {activeTab,activeSubPage,isNavigationCompact,routeTransitionName,settingsTabs,settingsSubPages,activeRoute,updateRoute,selectTab,openSubPage,closeSubPage};
}

