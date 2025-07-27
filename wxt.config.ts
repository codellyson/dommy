import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Dommy",
    description: "DOM Element Screenshot Tool",
    permissions: ["storage", "activeTab", "scripting", "sidePanel"],
    host_permissions: ["<all_urls>"],
    side_panel: {
      default_path: "side-panel.html",
    },
  },
});
