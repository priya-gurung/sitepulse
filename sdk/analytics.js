/**
 * SitePulse Analytics SDK
 * Privacy-first, lightweight (<3kb min+gzip target), no cookies.
 */
(function () {
  var scriptTag = document.currentScript;
  if (!scriptTag) return;

  var SITE_KEY = scriptTag.getAttribute("data-site-key");
  var ENDPOINT = scriptTag.getAttribute("data-endpoint") || "/collect";
  if (!SITE_KEY) {
    console.warn("[SitePulse] missing data-site-key, SDK disabled");
    return;
  }

  // Session ID: Retrieve from sessionStorage or generate and store a new one
  var SESSION_STORAGE_KEY = "sitepulse_sid";
  var sessionId = null;

  try {
    sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  } catch (e) {
    sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Queue and Batching State
  var queue = [];
  var FLUSH_INTERVAL = 10000; // 10 seconds
  var MAX_BATCH_SIZE = 20;
  var flushTimer = null;

  // Track the current URL to prevent duplicate route change tracking
  var currentUrl = location.href;

  function send(batchPayload) {
    if (!batchPayload || !batchPayload.length) return;

    var body = JSON.stringify(batchPayload);
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
    } else {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {
        /* swallow network errors */
      });
    }
  }

  function flush() {
    if (queue.length === 0) return;
    var itemsToSend = queue.splice(0, queue.length);
    send(itemsToSend);
  }

  function enqueue(event) {
    queue.push(event);

    if (queue.length >= MAX_BATCH_SIZE) {
      flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(function () {
        flushTimer = null;
        flush();
      }, FLUSH_INTERVAL);
    }
  }

  function basePayload() {
    return {
      publicKey: SITE_KEY,
      url: location.href,
      referrer: document.referrer || undefined,
      title: document.title,
      screenWidth: window.screen ? window.screen.width : undefined,
      screenHeight: window.screen ? window.screen.height : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      sessionId: sessionId,
      timestamp: Date.now(),
    };
  }

  function getPageviewEvent() {
    return Object.assign({ type: "pageview" }, basePayload());
  }

  function trackPageview() {
    enqueue(getPageviewEvent());
  }

  // Public API for custom events
  window.sitepulse = function (eventName, props) {
    enqueue(
      Object.assign(
        { type: "custom", eventName: eventName, props: props || {} },
        basePayload()
      )
    );
  };

  // --- Event Tracking: Clicks ---
  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target) return;

    var textContent = (target.innerText || target.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 100);

    var clickData = Object.assign({ type: "click" }, basePayload(), {
      clickData: {
        x: e.clientX,
        y: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        targetTag: target.tagName ? target.tagName.toLowerCase() : "",
        targetId: target.id || undefined,
        targetClass: target.className || undefined,
        text: textContent || undefined,
      },
    });

    enqueue(clickData);
  }, true);

  // Send initial pageview immediately on load
  send([getPageviewEvent()]);

  // --- SPA Route Tracking ---
  function handleRouteUpdate() {
    setTimeout(function () {
      // Only fire a new pageview if the URL actually changed
      if (currentUrl !== location.href) {
        currentUrl = location.href;
        trackPageview();
      }
    }, 0);
  }

  var originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    handleRouteUpdate();
  };

  var originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    handleRouteUpdate();
  };

  window.addEventListener("popstate", handleRouteUpdate);

  // Flush remaining events before unloading the page
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      flush();
    }
  });
})();