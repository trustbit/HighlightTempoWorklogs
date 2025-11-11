(async function () {
  // region "Variables & Constants"

  // Wait for settings from the bridge
  const settings = await new Promise((resolve) => {
    const handleMessage = (event) => {
      if (event.source !== window) return;

      if (event.data.type === "SETTINGS_RESPONSE") {
        window.removeEventListener("message", handleMessage);
        resolve(event.data.settings);
      }
    };

    window.addEventListener("message", handleMessage);

    // Request settings from the bridge
    const requestSettings = () => {
      window.postMessage({ type: "GET_SETTINGS" }, "*");
    };

    // Check if bridge is ready
    const checkBridge = (event) => {
      if (event.source !== window) return;
      if (event.data.type === "BRIDGE_READY") {
        window.removeEventListener("message", checkBridge);
        requestSettings();
      }
    };

    window.addEventListener("message", checkBridge);

    // Also try requesting immediately (bridge might already be ready)
    setTimeout(requestSettings, 100);
  });

  // Detect dark mode
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const mode = isDarkMode ? "dark" : "light";

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

  // Load stored colors from browser.storage (via bridge)
  const storedColors = (settings.colors && settings.colors[mode]) || {};
  const colors = { ...DEFAULTS[mode], ...storedColors };

  // Assign constants with explicit fallback to defaults
  const COLOR_BILLABLE_WITH_BILLABLE_SECONDS =
    colors.COLOR_BILLABLE_WITH_BILLABLE_SECONDS ||
    DEFAULTS[mode].COLOR_BILLABLE_WITH_BILLABLE_SECONDS;
  const COLOR_BILLABLE_NO_BILLABLE_SECONDS =
    colors.COLOR_BILLABLE_NO_BILLABLE_SECONDS ||
    DEFAULTS[mode].COLOR_BILLABLE_NO_BILLABLE_SECONDS;
  const COLOR_INTERNAL = colors.COLOR_INTERNAL || DEFAULTS[mode].COLOR_INTERNAL;
  const COLOR_TAT_TEMP = colors.COLOR_TAT_TEMP || DEFAULTS[mode].COLOR_TAT_TEMP;
  const COLOR_ERROR = colors.COLOR_ERROR || DEFAULTS[mode].COLOR_ERROR;
  const COLOR_LS = colors.COLOR_LS || DEFAULTS[mode].COLOR_LS;

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
          var link = el.querySelector(
            'div a[href^="https://timetoactgroup.atlassian.net/browse/"]'
          );

          if (link) {
            // Create a new <span> element
            const span = document.createElement("span");

            span.textContent = worklogData.comment;
            span.id = "customCommentSpan" + worklogId;
            span.title = link.href;

            // Replace the <a> element with the <span>
            link.replaceWith(span);
          }
        } else {
          existingCommentSpan.style.opacity = "1.0";
          const comment = document.getElementById(
            "customCommentSpan" + worklogId
          );

          if (comment) {
            const commentParent = comment.parentElement;

            const link = document.createElement("a");

            link.href = comment.title + commentParent.title;
            link.textContent = commentParent.title;
            link.target = "_blank";

            // Replace the <a> element with the <span>
            comment.replaceWith(link);
          }
        }
      });
      changeWorklogInformation(elements);
    });
  }

  function changeWorklogInformation(elements) {
    elements.forEach((el) => {
      const worklogId = el.id.replace("WORKLOG-", "");

      const worklogData =
        window.tempoWorklogData &&
        window.tempoWorklogData.find(
          (wl) => wl.originId.toString() === worklogId
        );

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
        var link = el.querySelector(
          'div a[href^="https://timetoactgroup.atlassian.net/browse/"]'
        );

        console.log("1");
        console.log(link);

        if (link) {
          console.log("1.1");
          // Create a new <span> element
          const span = document.createElement("span");

          span.textContent = worklogData.comment;
          span.id = "customCommentSpan" + worklogId;
          span.title = link.href;

          // Replace the <a> element with the <span>
          link.replaceWith(span);
        }
      } else {
        existingCommentSpan.style.opacity = "1.0";
        const comment = document.getElementById(
          "customCommentSpan" + worklogId
        );

        console.log("2");
        console.log(comment);

        if (comment) {
          console.log("2.1");
          const commentParent = comment.parentElement;

          const link = document.createElement("a");

          link.href = comment.title + commentParent.title;
          link.textContent = commentParent.title;
          link.target = "_blank";

          // Replace the <a> element with the <span>
          comment.replaceWith(link);
        }
      }
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
