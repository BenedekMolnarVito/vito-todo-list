import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.servimus.vitotodolist",
  appName: "VitoTodoList",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
