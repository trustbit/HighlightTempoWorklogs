const darkModeToggle = document.getElementById("darkModeToggle");
const colorInputs = document.querySelectorAll("input[type='color']");
const saveBtn = document.getElementById("save");
const resetBtn = document.getElementById("reset");
const modeIndicator = document.getElementById("modeIndicator");

// Default colors
const DEFAULTS = {
  light: {
    COLOR_BILLABLE_WITH_BILLABLE_SECONDS: "#efffddff", // Green background for billable worklogs with billable seconds
    COLOR_BILLABLE_NO_BILLABLE_SECONDS: "#fff4ddff", // Orange/Yellow background for billable worklogs without billable seconds
    COLOR_INTERNAL: "#FFDDDD", // "Lighter" Red background for internal worklogs (not billable)
    COLOR_TAT_TEMP: "#ddddffff", // Purple background for TAT_TEMP worklogs
    COLOR_ERROR: "#ff0000ff", // Red background for error worklogs
    COLOR_LS: "#d6efff", // Light Blue background for LS worklogs
  },
  dark: {
    COLOR_BILLABLE_WITH_BILLABLE_SECONDS: "#2e5e2e", // Green background for billable worklogs with billable seconds
    COLOR_BILLABLE_NO_BILLABLE_SECONDS: "#705a2e", // Orange/Yellow background for billable worklogs without billable seconds
    COLOR_INTERNAL: "#703232", // "Lighter" Red background for internal worklogs (not billable)
    COLOR_TAT_TEMP: "#444488", // Purple background for TAT_TEMP worklogs
    COLOR_ERROR: "#b33a3a", // Red background for error worklogs
    COLOR_LS: "#336b8a", // Light Blue background for LS worklogs
  },
};

// Load settings from browser.storage
async function loadSettings() {
  const result = await browser.storage.local.get("settings");
  const stored = result.settings || {};
  const isDarkMode =
    stored.isDarkMode ??
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const mode = isDarkMode ? "dark" : "light";

  darkModeToggle.checked = isDarkMode;

  // Update mode indicator
  if (modeIndicator) {
    modeIndicator.textContent = `(Currently editing ${mode} mode colors)`;
  }

  const colors = stored.colors?.[mode] || DEFAULTS[mode];

  // Fill color pickers
  for (const id in DEFAULTS[mode]) {
    const input = document.getElementById(id);
    if (input) input.value = colors[id] || DEFAULTS[mode][id];
  }
}

// Save settings to browser.storage
async function saveSettings() {
  const mode = darkModeToggle.checked ? "dark" : "light";
  const colors = {};
  colorInputs.forEach((input) => (colors[input.id] = input.value));

  const result = await browser.storage.local.get("settings");
  const stored = result.settings || {};
  stored.isDarkMode = darkModeToggle.checked;
  stored.colors = stored.colors || {};
  stored.colors[mode] = colors;

  await browser.storage.local.set({ settings: stored });
}

// Reset to default colors
async function resetSettings() {
  if (
    !confirm("Are you sure you want to reset all colors to default values?")
  ) {
    return;
  }

  const mode = darkModeToggle.checked ? "dark" : "light";

  // Clear stored colors for current mode
  const result = await browser.storage.local.get("settings");
  const stored = result.settings || {};

  if (stored.colors) {
    delete stored.colors[mode];
  }

  await browser.storage.local.set({ settings: stored });

  // Reload the color pickers with defaults
  loadSettings();
}

// Handle dark mode toggle
async function handleDarkModeToggle() {
  // Save the new dark mode preference first
  const result = await browser.storage.local.get("settings");
  const stored = result.settings || {};
  stored.isDarkMode = darkModeToggle.checked;
  await browser.storage.local.set({ settings: stored });

  // Then reload the colors for the new mode
  await loadSettings();
}

darkModeToggle.addEventListener("change", handleDarkModeToggle);
resetBtn.addEventListener("click", resetSettings);

// Auto-save when any color input changes
colorInputs.forEach((input) => {
  input.addEventListener("change", () => saveSettings());
});

// Initial load
loadSettings();
