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
            window.postMessage({type: "GET_SETTINGS"}, "*");
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
    const colors = {...DEFAULTS[mode], ...storedColors};

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
    const IS_TEMPORAL_IFRAME = window.location.href.includes("app.eu.tempo.io");

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

    // region "Time Entry Comment Caching"

    const IS_DESCRIPTION_SUGGESTION_ENABLED =
        settings.isDescriptionSuggestionEnabled ?? true;

    if (IS_DESCRIPTION_SUGGESTION_ENABLED && IS_TEMPORAL_IFRAME) {
        const DESCRIPTION_SUGGESTION_STORAGE_DAYS =
            settings.descriptionSuggestionStorageDays || 14;
        const PAGE_KEY = "tempo_comment_cache";
        const MAX_AGE_MS =
            DESCRIPTION_SUGGESTION_STORAGE_DAYS * 24 * 60 * 60 * 1000; // 30 days

        function safeParse(raw) {
            try {
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                console.warn("[tempo-cache] failed to parse cache, resetting:", e);
                return [];
            }
        }

        function loadCache() {
            try {
                const raw = localStorage.getItem(PAGE_KEY);
                return safeParse(raw);
            } catch (e) {
                console.warn("[tempo-cache] load failed:", e);
                return [];
            }
        }

        function saveCache(entries) {
            try {
                localStorage.setItem(PAGE_KEY, JSON.stringify(entries));
            } catch (e) {
                console.warn("[tempo-cache] save failed:", e);
            }
        }

        function clearCache() {
            try {
                localStorage.setItem(PAGE_KEY, JSON.stringify([]));
            } catch (e) {
                console.warn("[tempo-cache] clear failed:", e);
                return false;
            }
            return true;
        }

        // Attach to the API and create a console-friendly alias
        window.clearTempoCommentCache = clearCache;

        function purgeOldEntries(entries) {
            const cutoff = Date.now() - MAX_AGE_MS;
            const filtered = entries.filter((e) => {
                // Use lastUsed if present
                const t = e.lastUsed || 0;
                return t >= cutoff;
            });
            if (filtered.length !== entries.length) {
                saveCache(filtered);
            }
            return filtered;
        }

        // Convenience method: add a comment (increment count if exists)
        function addTimeEntryComment(comment, projectNumber) {
            if (!comment || typeof comment !== "string") return null;
            const normalized = comment.trim();
            if (normalized.length === 0) return null;

            const now = Date.now();
            const entries = loadCache();
            const idx = entries.findIndex((e) => e.comment === normalized);

            let entry;
            if (idx !== -1) {
                entry = entries[idx];
                entry.count = (entry.count || 0) + 1;
                entry.lastUsed = now;
                entries[idx] = entry;
            } else {
                entry = {
                    comment: normalized,
                    count: 1,
                    lastUsed: now,
                    projectNumber: projectNumber,
                };
                entries.push(entry);
            }

            saveCache(entries);
            return entry;
        }

        // Convenience method: list all comments ordered by count (desc)
        function listTimeEntryComments() {
            const entries = loadCache();
            // return a shallow copy sorted by count desc then lastUsed desc
            return entries.slice().sort((a, b) => {
                const countA = a.count || 0;
                const countB = b.count || 0;
                if (countB !== countA) return countB - countA;
                return (b.lastUsed || 0) - (a.lastUsed || 0);
            });
        }

        // Purge on load
        saveCache(purgeOldEntries(loadCache()));

        function addCommentEntrySelect(issueInputField) {
            if (!issueInputField) {
                console.error("[tempo-addCommentEntrySelect] no input field found");
                return;
            }

            // Create new select element for current project
            if (document.getElementById("tempoCommentSelect")) {
                document.getElementById("tempoCommentSelect").remove();
            }

            const worklogCommentField = document.getElementById("commentField");
            const issueInput = issueInputField.value.trim();
            const projectNumber = issueInput.substring(0, issueInput.indexOf(" "));

            if (worklogCommentField && projectNumber) {
                worklogCommentField.parentElement.style.flexDirection = "column";

                const commentSelect = document.createElement("select");
                commentSelect.id = "tempoCommentSelect";
                commentSelect.style.display = "block";
                commentSelect.style.marginBottom = "6px";
                commentSelect.style.padding = "8px";
                commentSelect.style.width = "100%";
                commentSelect.style.maxWidth = "500px";
                commentSelect.style.textOverflow = "ellipsis";

                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = "Select recent comment";
                placeholder.disabled = true;
                placeholder.selected = true;
                commentSelect.appendChild(placeholder);

                listTimeEntryComments()
                    .filter((entry) => {
                        return entry.projectNumber.startsWith(projectNumber);
                    })
                    .forEach((e) => {
                        const opt = document.createElement("option");
                        opt.value = e.comment;
                        opt.textContent = `${e.comment} (${e.count || 0})`;
                        commentSelect.appendChild(opt);
                    });

                if (worklogCommentField.parentElement) {
                    worklogCommentField.parentElement.insertBefore(
                        commentSelect,
                        worklogCommentField
                    );
                }

                commentSelect.addEventListener("change", () => {
                    // Shenanigans to properly set the value and trigger any listeners for React
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype,
                        "value"
                    ).set;
                    setter.call(worklogCommentField, commentSelect.value);

                    worklogCommentField.dispatchEvent(
                        new Event("input", {bubbles: true, cancelable: true})
                    );
                });

                // time log get's updated
                document.getElementById("logTimeBtn").addEventListener("click", () => {
                    if (
                        issueInputField &&
                        worklogCommentField &&
                        worklogCommentField.value.trim()
                    ) {
                        addTimeEntryComment(
                            worklogCommentField.value.trim(),
                            projectNumber
                        );
                        setupModalObserver();
                    }
                });
            }
        }

        function callOnValueChanged(elementId, callback) {
            const checkContent = () => {
                const el = document.getElementById(elementId);

                if (el && el.value && el.value.trim().length > 0) {
                    const value = el.value.trim();

                    if (!el.__last_value) {
                        callback(el);
                    } else if (value !== el.__last_value) {
                        callback(el);
                    }
                    el.__last_value = value;
                }
            };

            setInterval(checkContent, 50);
        }

        function setupModalObserver() {
            waitForElement(
                "#form-issue-input",
                (elements) => {
                    if (elements && elements.length) {
                        // We need to do a poll approach, as no listener seems to work reliably here 
                        // This might be to the reason that there is always a new input field created 
                        callOnValueChanged("form-issue-input", () => {
                            addCommentEntrySelect(
                                document.getElementById("form-issue-input")
                            );
                        });
                    }
                },
                Number.MAX_VALUE
            );
        }

        setupModalObserver();
    }

    // endregion "Time Entry Comment Caching"
    // Only listen for location changes in the Tempo iframe
    if (IS_TEMPORAL_IFRAME) {
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
    if (IS_TEMPORAL_IFRAME) {
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
