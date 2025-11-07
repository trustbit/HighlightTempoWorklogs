// ==UserScript==
// @name         Tempo Worklog Highlighter
// @namespace    Violentmonkey Scripts
// @version      1.2
// @description  Highlights working logs based on billable seconds and internal or customer
// @author       Armin Schneider
// @match        *://timetoactgroup.atlassian.net/*
// @match        https://app.eu.tempo.io/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  // region "Variables & Constants"

  // Detect dark mode
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Set highlighting colors (light and dark theme variants)
  const COLOR_BILLABLE_WITH_BILLABLE_SECONDS = isDarkMode
    ? "#2e5e2e"
    : "#efffddff"; // Green background for billable worklogs with billable seconds
  const COLOR_BILLABLE_NO_BILLABLE_SECONDS = isDarkMode
    ? "#705a2e"
    : "#fff4ddff"; // Orange/Yellow background for billable worklogs without billable seconds
  const COLOR_INTERNAL = isDarkMode ? "#703232" : "#FFDDDD"; // "Lighter" Red background for internal worklogs (not billable)
  const COLOR_TAT_TEMP = isDarkMode ? "#444488" : "#ddddffff"; // Purple background for TAT_TEMP worklogs
  const COLOR_ERROR = isDarkMode ? "#b33a3a" : "#ff0000ff"; // Red background for error worklogs
  const COLOR_LS = isDarkMode ? "#336b8a" : "#d6efff"; // Light Blue background for LS worklogs

  // Check if we're in the Tempo iframe
  const isTempoIframe = window.location.href.includes("app.eu.tempo.io");

  // Create global variable to store Tempo worklog data
  window.tempoWorklogData = [];

  // endregion "Variables & Constants"

  // region "DOM and Navigation Monitoring"

  const _push = history.pushState;
  const _replace = history.replaceState;

  history.pushState = function () {
    _push.apply(this, arguments);
    window.dispatchEvent(new Event("locationchange"));
  };

  history.replaceState = function () {
    _replace.apply(this, arguments);
    window.dispatchEvent(new Event("locationchange"));
  };

  // --- Listen to all relevant navigation events ---

  window.addEventListener("popstate", () =>
    window.dispatchEvent(new Event("locationchange"))
  );
  window.addEventListener("hashchange", () =>
    window.dispatchEvent(new Event("locationchange"))
  );

  // Only listen for location changes in the Tempo iframe
  if (isTempoIframe) {
    window.addEventListener("locationchange", onWeekChangedInIframe);

    // Set up MutationObserver to watch for DOM changes
    const setupObserver = () => {
      if (!document.body) {
        setTimeout(setupObserver, 100);
        return;
      }

      const observer = new MutationObserver((mutations) => {
        // Check if any worklog elements were added
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) {
                // Element node
                // Check if the node or its descendants contain worklog elements
                if (node.id && node.id.startsWith("WORKLOG-")) {
                  onWeekChangedInIframe();
                  return;
                }
                if (
                  node.querySelector &&
                  node.querySelector('div[id^="WORKLOG-"]')
                ) {
                  onWeekChangedInIframe();
                  return;
                }
              }
            }
          }
        }
      });

      // Start observing the document with the configured parameters
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    };

    setupObserver();
  }

  // endregion "DOM and Navigation Monitoring"

  // region "Worklog Processing and Highlighting"

  // This runs every time the page changes inside the Tempo iframe
  function onWeekChangedInIframe() {
    waitForElement('div[id^="WORKLOG-"]', (elements) => {
      elements.forEach((el) => {
        const worklogId = el.id.replace("WORKLOG-", "");

        const worklogData =
          window.tempoWorklogData &&
          window.tempoWorklogData.find(
            (wl) => wl.originId.toString() === worklogId
          );

        if (!worklogData) return;

        if (
          worklogData.attributes._Account_.value.endsWith("SAP_C") &&
          worklogData.billableSeconds > 0
        ) {
          el.style.backgroundColor = COLOR_BILLABLE_WITH_BILLABLE_SECONDS;
        } else if (
          worklogData.attributes._Account_.value.endsWith("SAP_C") &&
          worklogData.billableSeconds === 0
        ) {
          el.style.backgroundColor = COLOR_BILLABLE_NO_BILLABLE_SECONDS;
        } else if (worklogData.attributes._Account_.value === "ERRORACCOUNT") {
          el.style.backgroundColor = COLOR_ERROR;
        } else if (worklogData.attributes._Account_.value === "TATTEMP") {
          el.style.backgroundColor = COLOR_TAT_TEMP;
        } else if (
          //Will break sooner or later
          worklogData.attributes._Account_.value.includes("TATINT.1.2")
        ) {
          //CAUTION: UGLY CODE
          el.style.backgroundColor = COLOR_LS;
        } else {
          el.style.backgroundColor = COLOR_INTERNAL;
        }

        const header = el.querySelector("div[title]");

        if (header && header.title.trim() === header.textContent.trim()) {
          Object.assign(header.style, {
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "block",
          });
        }

        const existingCommentSpan = el.querySelector(
          'div[name="tempoCardComment"]'
        );

        if (!existingCommentSpan) {
          // Select the <a> element inside the div
          const link = el.querySelector(
            'div a[href^="https://timetoactgroup.atlassian.net/browse/"]'
          );

          if (link) {
            // Create a new <span> element
            const span = document.createElement("span");
            span.textContent = worklogData.comment;

            // Replace the <a> element with the <span>
            link.replaceWith(span);
          }
        } else {
          existingCommentSpan.style.opacity = "1.0";
        }
      });
    });
  }

  // Helper function to wait for elements to appear in the DOM
  function waitForElement(selector, callback, timeout = 5000) {
    const startTime = Date.now();

    const checkElement = () => {
      const elements = document.querySelectorAll(selector);

      if (elements.length > 0) {
        callback(elements);
      } else if (Date.now() - startTime < timeout) {
        setTimeout(checkElement, 50);
      } else {
        callback([]);
      }
    };
    checkElement();
  }

  // endregion "Worklog Processing and Highlighting"

  // region "Retrieve Tempo worklog data via XHR interception"

  function upsertWorklogs(data) {
    // Ensure data is always an array
    const worklogs = Array.isArray(data) ? data : [data];

    for (const wl of worklogs) {
      const index = window.tempoWorklogData.findIndex(
        (existing) => existing.tempoWorklogId === wl.tempoWorklogId
      );

      if (index !== -1) {
        // Update existing worklog
        window.tempoWorklogData[index] = wl;
      } else {
        // Add new worklog
        window.tempoWorklogData.push(wl);
      }
    }
    onWeekChangedInIframe();
  }

  // Only set up XHR interception in the Tempo iframe
  if (isTempoIframe) {
    // Intercept XMLHttpRequest
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._logUrl = url;
      this._logMethod = method;
      return origOpen.apply(this, [method, url, ...rest]);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      // Check if this is the Tempo worklog request

      if (
        this._logUrl &&
        this._logUrl.includes("/rest/tempo-timesheets/4/worklogs")
      ) {
        this.addEventListener("load", function () {
          try {
            const data = JSON.parse(this.responseText);
            upsertWorklogs(data);
          } catch (e) {
            console.error("[TEMPO] Failed to parse response:", e);
          }
        });
      }
      return origSend.apply(this, args);
    };
  }

  // endregion "Retrieve Tempo worklog data via XHR interception"
})();
