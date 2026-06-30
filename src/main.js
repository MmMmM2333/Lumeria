import { createApp } from "vue";
import "./fluent/registerFluentComponents.js";
import { shouldMountMotionLab } from "./motionLab/motionLabGate.js";

const search = typeof window === "undefined" ? "" : window.location.search;
const loadApp = import.meta.env.DEV && shouldMountMotionLab(search, true)
  ? () => import("./motionLab/MotionLabApp.vue")
  : () => import("./App.vue");

loadApp().then((appModule) => {
  createApp(appModule.default).mount("#app");
});
