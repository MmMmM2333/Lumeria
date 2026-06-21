import { createApp } from "vue";
import { shouldMountMotionLab } from "./motionLab/motionLabModel.js";

const search = typeof window === "undefined" ? "" : window.location.search;
const loadApp = shouldMountMotionLab(search, import.meta.env.DEV)
  ? () => import("./motionLab/MotionLabApp.vue")
  : () => import("./App.vue");

loadApp().then((appModule) => {
  createApp(appModule.default).mount("#app");
});
