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

### 🔹 Firefox - customizable (works 50/50 - no solution found - issue explaned below)

1. Download and install the **[ViolentMonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/)** browser extension.
2. After installation, click the ViolentMonkey icon and select **“Create a new script”**.
3. Copy the entire code from your local **`script.js`** file and **paste it** into the code editor (replace all existing code).
4. Save the script and **reload your Atlassian.net** page to see the highlights in action.

### 🔹 Firefox (just works)

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

You can modify color variables defined at the top of `script.js` to match your personal preferences

---

## 🧩 Default Color meanings:

- **_Green_:** Worklog account is billable and has billable time
- **_Orange_:** Worklog account is billable but has no billable time
- **_Light-Red_:** Worklog account is not billable
- **_Dark-Red_:** Worklog has the "ErrorAccount" as account => has to be fixed
- **_Purple_:** Worklog has "TATTemp" as account => likely has to be changed to something else

## FireFox issue

The script will run on some FireFox installations without any issues. On some installations it will never run...
I believe this is due to some CrossOrigin policy or how the script is sandboxed, since on the installation it does not work, 
the part of the script that should be in the IFrame is not running in the IFrame, but in a Sandbox and thus can't properly intercept the network traffic of the IFrame
**Fix**: Install the .xpi extension
