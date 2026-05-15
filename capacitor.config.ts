import type {CapacitorConfig} from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chroniclecanvas.app",
  appName: "Chronicle Canvas",
  webDir: "www",
  server: {
    allowNavigation: [
      "chroniclecanvas.us",
      "*.chroniclecanvas.us",
      "timeline-builder-a5292.firebaseapp.com",
      "*.googleapis.com",
      "*.gstatic.com",
      "*.firebaseio.com",
      "*.firebasestorage.app"
    ]
  },
  ios: {
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#071120",
    contentInset: "automatic"
  }
};

export default config;
