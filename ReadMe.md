# Tempo Worklog Highlighter

**Author:** Armin Schneider  
**Date:** October 2025

## 🧭 Introduction

The **Tempo Worklog Highlighter** automatically highlights your worklogs in Atlassian Tempo depending on:

- The **billable state** (whether the SAP account is billable)
- The **billable time** recorded

This helps you quickly visualize which worklogs are billable and which are not.

---

## ⚙️ Installation Guide

### 🔹 Firefox

1. Exectue the .xpi file in the "Extension" folder with FireFox (or FireFox based browsers)

### 🔹 Chrome

1. Download and install the **[TamperMonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)** browser extension.
2. Go to your **Extensions** (chrome://extensions/), find TamperMonkey and click **Details**

- Enable **Allow User Scripts**
- Enable **Allow Access to File URLs**

3. After installation, click the TamperMonkey icon and select **“Create a new script”**.
4. Copy the entire code from your local **`script.js`** file and **paste it** into the code editor (replace all existing code).
5. Save the script and **reload your Atlassian.net** page to see the highlights in action.

---

## 🎨 Customization

### TamperMonkey installations

You can modify color variables defined at the top of `script.js` to match your personal preferences.

### FireFox Addon

Click on the addon in your Toolbar and go to the settings page. Here you can adjust your preferred colors.

---

## 🧩 Default color meanings:

- **_Green_:** Worklog account is billable and has billable time
- **_Orange_:** Worklog account is billable but has no billable time
- **_Light-Red_:** Worklog account is not billable
- **_Dark-Red_:** Worklog has the "ErrorAccount" as account => has to be fixed
- **_Purple_:** Worklog has "TATTemp" as account => likely has to be changed to something else
- **_Light-Blue_:** Worklog is likely a "Learning" worklog

## Bug-Reports

Any bug/issue/improvement can be reported to armin.schneider@timetoact.at
