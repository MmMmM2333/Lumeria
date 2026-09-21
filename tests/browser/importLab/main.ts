import {createApp} from "vue";
import ImportLabApp from "./ImportLabApp.vue";
import "./importLab.css";
const root=document.getElementById("app")!;
if(import.meta.env.DEV)createApp(ImportLabApp).mount(root);
else root.textContent="应用导入实验页仅在开发模式下可用。";
