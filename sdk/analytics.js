/**
 * SitePulse Analytics SDK
 * Privacy-first, lightweight (<3kb min+gzip target), no cookies.
 *
 * Usage:
 *   <script src="https://cdn.example.com/analytics.js"
 *           data-site-key="pk_xxx"
 *           data-endpoint="https://collect.example.com/collect"
 *           async></script>
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

  // Session id: rotates per tab, held in-memory only (no cookies/localStorage
  // required — visitor identity is derived server-side from a salted hash).
  var sessionId =
    Date.now().toString(36) + Math.random().toString(36).slice(2);

  function send(payload) {
    var body = JSON.stringify(payload);
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
        /* swallow network errors — analytics must never break the page */
      });
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

  function trackPageview() {
    send(Object.assign({ type: "pageview" }, basePayload()));
  }

  // Public API for custom events: window.sitepulse('signup_completed', {plan: 'pro'})
  window.sitepulse = function (eventName, props) {
    send(
      Object.assign(
        { type: "custom", eventName: eventName, props: props || {} },
        basePayload()
      )
    );
  };

  trackPageview();

  // Track SPA route changes (History API pushState/popstate).
  var originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    trackPageview();
  };
  window.addEventListener("popstate", trackPageview);
})();
