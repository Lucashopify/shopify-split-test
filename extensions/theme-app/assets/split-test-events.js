/* Split Test App — async event tracking */
(function (w, d) {
  var cfg = w.__SPT_CFG__;
  var asgn = w.__SPT_ASGN__;
  var visitorId = w.__SPT_VID__;
  if (!cfg || !asgn || !visitorId) return;

  var apiUrl = (cfg.apiUrl || '').replace(/\/$/, '');
  if (!apiUrl) return;

  /* ── consent check ───────────────────────────────────────────────── */
  function hasConsent() {
    try {
      var cp = w.Shopify && w.Shopify.customerPrivacy;
      if (!cp) return true;
      return cp.analyticsProcessingAllowed();
    } catch (e) { return true; }
  }

  /* ── send helper ─────────────────────────────────────────────────── */
  function sendBeacon(url, body) {
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    }
  }

  function getDevice() {
    var w2 = w.innerWidth;
    if (w2 < 768) return 'mobile';
    if (w2 < 1024) return 'tablet';
    return 'desktop';
  }

  /* ── page view ───────────────────────────────────────────────────── */
  function sendPageView() {
    if (!hasConsent()) return;
    sendBeacon(apiUrl + '/api/events', JSON.stringify({
      type: 'PAGE_VIEW',
      visitorId: visitorId,
      assignments: asgn,
      shopDomain: (w.Shopify || {}).shop || location.hostname,
      pageUrl: location.href,
      device: getDevice(),
      ts: Date.now(),
    }));
  }

  /* ── cart sync ───────────────────────────────────────────────────── */
  function syncCart() {
    if (!Object.keys(asgn).length) return;
    if (!w.Shopify || !w.Shopify.routes) return;
    var root = w.Shopify.routes.root || '/';
    fetch(root + 'cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: { _spt_vid: visitorId, _spt_asgn: JSON.stringify(asgn) } }),
    }).catch(function () {});
  }

  /* ── confirm assignment ──────────────────────────────────────────── */
  function confirmAssign() {
    if (!Object.keys(asgn).length) return;
    fetch(apiUrl + '/api/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain: (w.Shopify || {}).shop || location.hostname,
        visitorToken: visitorId,
        assignments: asgn,
        device: getDevice(),
        pageUrl: location.href,
      }),
    }).catch(function () {});
  }

  /* ── price adjustment ────────────────────────────────────────────── */
  function applyPriceAdj() {
    var html = d.documentElement;
    var adjType = html.getAttribute('data-spt-price-adj-type');
    var adjValue = parseFloat(html.getAttribute('data-spt-price-adj-value') || '');
    if (!adjType || isNaN(adjValue)) return;
    var sels = [
      '.price__regular .price-item--regular',
      '.price__sale .price-item--sale',
      '.price-item',
      '[data-product-price]',
      '.product__price',
    ];
    var seen = new WeakSet();
    sels.forEach(function (sel) {
      d.querySelectorAll(sel).forEach(function (el) {
        if (seen.has(el)) return;
        seen.add(el);
        var text = el.textContent || '';
        var match = text.match(/[\d,]+\.?\d*/);
        if (!match) return;
        var raw = parseFloat(match[0].replace(/,/g, ''));
        if (isNaN(raw)) return;
        var adj = adjType === 'percent' ? raw * (1 - adjValue / 100) : raw - adjValue;
        if (adj < 0) adj = 0;
        el.textContent = text.replace(match[0], adj.toFixed(2));
      });
    });
  }

  /* ── init ────────────────────────────────────────────────────────── */
  function init() {
    sendPageView();
    syncCart();
    confirmAssign();
    applyPriceAdj();
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
