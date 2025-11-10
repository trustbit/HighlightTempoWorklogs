// This script runs in the isolated world and has access to browser.storage
// It bridges communication between the main world content.js and extension storage

// Listen for requests from the main world
window.addEventListener("message", async (event) => {
  // Only accept messages from the same origin
  if (event.source !== window) return;

  if (event.data.type === "GET_SETTINGS") {
    try {
      const result = await browser.storage.local.get("settings");
      const settings = result.settings || {};

      // Send the settings back to the main world
      window.postMessage(
        {
          type: "SETTINGS_RESPONSE",
          settings: settings,
        },
        "*"
      );
    } catch (error) {
      console.error("[TEMPO] Failed to get settings:", error);
      window.postMessage(
        {
          type: "SETTINGS_RESPONSE",
          settings: {},
        },
        "*"
      );
    }
  }
});

// Notify the main world that the bridge is ready
window.postMessage({ type: "BRIDGE_READY" }, "*");
