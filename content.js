(function () {
  // Create global variable to store Tempo worklog data
  window.tempoWorklogData = null;

  // Check if we're in the Tempo iframe
  const isTempoIframe = window.location.href.includes("app.eu.tempo.io");

  // region "When does the color adjust script execute"

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

  // endregion "When does the color adjust script execute"

  // region "Execution logic"

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
          el.style.backgroundColor = "#efffddff"; // Light green background for matching worklogs
        } else if (
          worklogData.attributes._Account_.value.endsWith("SAP_C") &&
          worklogData.billableSeconds === 0
        ) {
          el.style.backgroundColor = "#fff4ddff"; // Light orange background for matching worklogs
        } else if (worklogData.attributes._Account_.value.endsWith("SAP_I")) {
          el.style.backgroundColor = "#FFDDDD"; // Light red background for matching worklogs
        } else if (worklogData.attributes._Account_.value === "ERRORACCOUNT") {
          el.style.backgroundColor = "#ff0000ff"; // Red background for matching worklogs
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

  // endregion "Execution logic"

  // region "Retrieve Tempo worklog data via XHR interception"

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
        this._logUrl.includes("/rest/tempo-timesheets/4/worklogs/search")
      ) {
        this.addEventListener("load", function () {
          try {
            const data = JSON.parse(this.responseText);
            window.tempoWorklogData = data;
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
