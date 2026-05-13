/* Split Test App — storefront init + event tracking
 * Tries inline config (from Liquid metafield), falls back to API fetch.
 */
(function (w, d) {
  var APP_URL = 'https://amused-bravery-production-e9f7.up.railway.app';
  var shop = w.__SPT_SHOP__;
  if (!shop) return;

  /* ── core logic ─────────────────────────────────────────────────── */
  function run(cfg) {
    var exps = cfg.experiments || [];
    var apiUrl = (cfg.apiUrl || APP_URL).replace(/\/$/, '');
    if (!exps.length) return;

    /* cookies */
    var VC = 'spt_vid', AC = 'spt_asgn';
    var YEAR = 31536000;
    var sec = location.protocol === 'https:' ? '; Secure' : '';
    var csfx = '; Path=/; Max-Age=' + YEAR + '; SameSite=Lax' + sec;
    function gc(n) { var m = d.cookie.match('(?:^|;)\\s*' + n + '=([^;]+)'); return m ? decodeURIComponent(m[1]) : null; }
    function sc(n, v) { d.cookie = n + '=' + encodeURIComponent(v) + csfx; }

    /* visitor id */
    function r32() {
      try { return (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0).toString(16).padStart(8, '0'); }
      catch (e) { return (Math.random() * 0xFFFFFFFF >>> 0).toString(16).padStart(8, '0'); }
    }
    function vid() { var v = gc(VC); if (!v) { v = r32() + r32() + r32() + r32(); sc(VC, v); } return v; }

    /* FNV-1a hash for deterministic bucketing */
    function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)); h = (h * 16777619) >>> 0; } return h; }
    function bkt(v, e) { return fnv(v + ':' + e) % 100; }

    function getAsgn() { try { return JSON.parse(gc(AC) || '{}'); } catch (e) { return {}; } }
    function saveAsgn(a) { sc(AC, JSON.stringify(a)); }

    var visitorId = vid();
    var asgn = getAsgn();
    var changed = false;
    var html = d.documentElement;

    html.classList.add('spt-loading');

    /* safety: always show page within 2s even if something goes wrong */
    var showPage = function() {
      html.classList.remove('spt-loading');
      html.classList.add('spt-ready');
    };
    var safetyTimer = setTimeout(showPage, 2000);

    /* segment matching — evaluates client-knowable fields only; unknown fields → allow */
    var _urlParams = new URLSearchParams(location.search);
    var _clientAttrs = {
      device: null, // set lazily after getDevice is defined
      utmSource: _urlParams.get('utm_source') || '',
      utmMedium: _urlParams.get('utm_medium') || '',
      utmCampaign: _urlParams.get('utm_campaign') || '',
      referrer: d.referrer || '',
      market: (w.Shopify && w.Shopify.routes && w.Shopify.routes.root) || '/',
    };
    function matchSegment(seg) {
      if (!seg || !seg.rules) return true;
      var rules = seg.rules;
      var children = rules.children || [];
      if (!children.length) return true;
      // device is only resolvable after DOMContentLoaded, approximate now from window.innerWidth
      var deviceNow = w.innerWidth < 768 ? 'mobile' : w.innerWidth < 1024 ? 'tablet' : 'desktop';
      var attrs = { device: deviceNow, utmSource: _clientAttrs.utmSource, utmMedium: _clientAttrs.utmMedium, utmCampaign: _clientAttrs.utmCampaign, referrer: _clientAttrs.referrer, market: _clientAttrs.market };
      var results = children.map(function(child) {
        if (!(child.field in attrs)) return true; // server-only field (country, customerType) → allow client-side
        var val = (attrs[child.field] || '').toLowerCase();
        var target = (child.value || '').toLowerCase();
        if (child.op === 'eq') return val === target;
        if (child.op === 'neq') return val !== target;
        if (child.op === 'contains') return val.indexOf(target) !== -1;
        return true;
      });
      return rules.op === 'OR' ? results.some(function(r) { return r; }) : results.every(function(r) { return r; });
    }

    /* assign variants */
    for (var i = 0; i < exps.length; i++) {
      var exp = exps[i];
      if (exp.status !== 'RUNNING') continue;
      if (!matchSegment(exp.segment)) continue;
      var allocB = fnv(visitorId + ':' + exp.id + ':alloc') % 100;
      if (allocB >= (exp.trafficAllocation || 100)) continue;
      var varId = asgn[exp.id];
      if (!varId) {
        var b = bkt(visitorId, exp.id), cum = 0, vs = exp.variants || [];
        for (var j = 0; j < vs.length; j++) { cum += vs[j].trafficWeight || 0; if (b < cum) { varId = vs[j].id; break; } }
        if (varId) { asgn[exp.id] = varId; changed = true; }
      }
      if (varId) { html.classList.add('spt-e-' + exp.id.slice(-8) + '-v-' + varId.slice(-8)); }
    }

    if (changed) saveAsgn(asgn);

    /* ── Shopify Markets helpers ─────────────────────────────────────── */
    // Shopify sets routes.root to the market subfolder, e.g. "/en-us/" or "/"
    function marketRoot() {
      return (w.Shopify && w.Shopify.routes && w.Shopify.routes.root) || '/';
    }
    // Strip the market prefix so "/en-us/products/shirt" → "/products/shirt"
    function stripMarket(path) {
      var root = marketRoot();
      if (root === '/') return path;
      return path.indexOf(root) === 0 ? '/' + path.slice(root.length) : path;
    }
    // Prepend the market prefix to a root-relative URL
    function withMarket(url) {
      var root = marketRoot();
      if (root === '/') return url;
      return root + url.replace(/^\//, '');
    }

    /* apply variant-specific behaviour */
    for (var k = 0; k < exps.length; k++) {
      var eA = exps[k];
      if (eA.status !== 'RUNNING') continue;
      var vId = asgn[eA.id];
      if (!vId) continue;
      var vs2 = eA.variants || [], av = null;
      for (var m = 0; m < vs2.length; m++) { if (vs2[m].id === vId) { av = vs2[m]; break; } }
      if (!av || av.isControl) continue;
      if (eA.type === 'URL_REDIRECT' && av.redirectUrl) {
        var strippedPath = stripMarket(location.pathname) + location.search;
        if (strippedPath !== av.redirectUrl && location.href !== av.redirectUrl) {
          clearTimeout(safetyTimer); w.location.replace(withMarket(av.redirectUrl)); return;
        }
      }
      if (eA.type === 'PRICE' && av.priceAdjValue != null) {
        html.setAttribute('data-spt-price-adj-type', av.priceAdjType || 'percent');
        html.setAttribute('data-spt-price-adj-value', String(av.priceAdjValue));
        // Store numeric product ID extracted from GID (e.g. "gid://shopify/Product/123" → "123")
        if (eA.targetProductId) {
          html.setAttribute('data-spt-price-product-id', String(eA.targetProductId).split('/').pop() || '');
        }
      }
      if (eA.type === 'TEMPLATE' && av.redirectUrl) {
        var viewName = av.redirectUrl;
        var tParams = new URLSearchParams(location.search);
        if (tParams.get('view') !== viewName) {
          var tmpl = eA.targetTemplate;
          var canonicalPath = stripMarket(location.pathname);
          var applies = true;
          if (tmpl === 'product') applies = /^\/products\//.test(canonicalPath);
          else if (tmpl === 'collection') applies = /^\/collections\//.test(canonicalPath);
          else if (tmpl === 'page') applies = /^\/pages\//.test(canonicalPath);
          else if (tmpl === 'index') applies = canonicalPath === '/';
          else if (tmpl === 'blog') applies = /^\/blogs\/[^/]+\/?$/.test(canonicalPath);
          else if (tmpl === 'article') applies = /^\/blogs\/.+\/.+/.test(canonicalPath);
          if (applies) {
            tParams.set('view', viewName);
            clearTimeout(safetyTimer);
            w.location.replace(location.pathname + '?' + tParams.toString() + location.hash);
            return;
          }
        }
      }
      if (eA.type === 'THEME' && av.themeId) {
        // Extract numeric ID from GID like "gid://shopify/Theme/123456789"
        var numericId = String(av.themeId).split('/').pop();
        var currentThemeId = w.Shopify && w.Shopify.theme && String(w.Shopify.theme.id);
        var params = new URLSearchParams(location.search);
        var previewParam = params.get('preview_theme_id');

        if (currentThemeId === numericId) {
          // Already on correct theme — clean all redirect params from URL
          params.delete('preview_theme_id');
          params.delete('_ab');
          params.delete('_fd');
          params.delete('_sc');
          var cleanSearch = params.toString();
          var cleanUrl = location.pathname + (cleanSearch ? '?' + cleanSearch : '') + location.hash;
          w.history.replaceState(null, '', cleanUrl);
          // Remove Shopify's preview bar from DOM
          var sel = '#preview-bar-iframe, #PBarNextFrameWrapper';
          var bar = d.querySelector(sel);
          if (bar) {
            bar.remove();
          } else {
            var obs = new MutationObserver(function() {
              var b = d.querySelector(sel);
              if (b) { b.remove(); obs.disconnect(); }
            });
            obs.observe(d.documentElement, { childList: true, subtree: true });
          }
        } else {
          // Wrong theme — redirect to variant theme
          params.set('preview_theme_id', numericId);
          params.set('_ab', '0');
          params.set('_fd', '0');
          params.set('_sc', '1');
          clearTimeout(safetyTimer); w.location.replace(location.pathname + '?' + params.toString() + location.hash);
          return;
        }
      }
    }

    /* no redirect needed — reveal page */
    clearTimeout(safetyTimer);
    showPage();

    /* expose for debugging */
    w.__SPT_VID__ = visitorId;
    w.__SPT_ASGN__ = asgn;
    w.__SPT_CFG__ = cfg;

    /* ── event helpers ────────────────────────────────────────────── */
    function hasConsent() {
      try { var cp = w.Shopify && w.Shopify.customerPrivacy; if (!cp) return true; return cp.analyticsProcessingAllowed(); }
      catch (e) { return true; }
    }

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

    function sendEvent(type, extra) {
      if (!hasConsent()) return;
      if (!Object.keys(asgn).length) return; // no experiments — nothing to record
      var payload = { type: type, visitorId: visitorId, assignments: asgn, shopDomain: shop, pageUrl: location.href, device: getDevice(), ts: Date.now() };
      if (extra) { for (var k in extra) payload[k] = extra[k]; }
      sendBeacon(apiUrl + '/api/events', JSON.stringify(payload));
    }

    function sendPageView() {
      if (!hasConsent()) return;
      sendBeacon(apiUrl + '/api/events', JSON.stringify({
        type: 'PAGE_VIEW', visitorId: visitorId, assignments: asgn,
        shopDomain: shop, pageUrl: location.href, device: getDevice(), ts: Date.now(),
      }));
    }

    // Deduplicate ATC events within a short window so rapid re-fires
    // (form submit + cart:add on the same interaction) only record once.
    var _lastAtc = 0;
    function sendAtc() {
      var now = Date.now();
      if (now - _lastAtc < 500) return;
      _lastAtc = now;
      sendEvent('ADD_TO_CART');
    }

    var _lastCheckout = 0;
    function sendCheckout() {
      var now = Date.now();
      if (now - _lastCheckout < 500) return;
      _lastCheckout = now;
      sendEvent('INITIATE_CHECKOUT');
    }

    function trackCheckout() {
      // 1. Form submit to /checkout (cart page checkout button)
      d.addEventListener('submit', function(e) {
        var action = (e.target && (e.target.action || e.target.getAttribute('action'))) || '';
        if (action.indexOf('/checkout') !== -1) sendCheckout();
      }, true);

      // 2. Click on common checkout button selectors
      d.addEventListener('click', function(e) {
        var t = e.target;
        if (!t) return;
        var el = t.closest
          ? t.closest('[name="checkout"],[href*="/checkout"],[data-checkout-btn],#checkout,.cart__checkout,.cart-checkout')
          : null;
        if (el) sendCheckout();
      }, true);
    }

    function trackAtc() {
      // 1. Standard form submit to /cart/add (most Shopify themes)
      d.addEventListener('submit', function(e) {
        var action = (e.target && (e.target.action || e.target.getAttribute('action'))) || '';
        if (action.indexOf('/cart/add') !== -1) sendAtc();
      }, true);

      // 2. Shopify custom DOM events fired by themes and cart drawer JS
      d.addEventListener('cart:add', sendAtc);
      d.addEventListener('cart:added', sendAtc);
      d.addEventListener('items-added', sendAtc); // Dawn theme event

      // 3. Click on common ATC button selectors (covers fetch-based cart adds
      //    where no form submit fires). Fires optimistically on click.
      d.addEventListener('click', function(e) {
        var t = e.target;
        if (!t) return;
        var el = t.closest
          ? t.closest('[data-add-to-cart],[name="add"],[data-action="add-to-cart"],[data-btn-addtocart],.add_to_cart,.btn--add-to-cart')
          : null;
        if (el) sendAtc();
      }, true);
    }

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

    function confirmAssign() {
      if (!Object.keys(asgn).length) return;
      fetch(apiUrl + '/api/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain: shop,
          visitorToken: visitorId,
          assignments: asgn,
          device: getDevice(),
          pageUrl: location.href,
          referrer: d.referrer || undefined,
          utmSource: _clientAttrs.utmSource || undefined,
          utmMedium: _clientAttrs.utmMedium || undefined,
          utmCampaign: _clientAttrs.utmCampaign || undefined,
        }),
      }).catch(function () {});
    }

    function applyPriceAdj() {
      var adjType = html.getAttribute('data-spt-price-adj-type');
      var adjValue = parseFloat(html.getAttribute('data-spt-price-adj-value') || '');
      if (!adjType || isNaN(adjValue)) return;

      var targetId = html.getAttribute('data-spt-price-product-id');
      // On a PDP, Shopify.product.id tells us exactly which product this is.
      // On other pages (collection, cart) we fall back to DOM-walking (see per-element check below).
      var pdpProductId = targetId
        ? ((w.Shopify && w.Shopify.product && String(w.Shopify.product.id)) ||
           (w.ShopifyAnalytics && w.ShopifyAnalytics.meta && w.ShopifyAnalytics.meta.product && String(w.ShopifyAnalytics.meta.product.id)))
        : null;
      // If we're on a PDP for a DIFFERENT product, skip entirely.
      if (pdpProductId && targetId && pdpProductId !== targetId) return;

      // Helper: try to resolve the product id from a DOM element's ancestors.
      // Covers product cards ([data-product-id], [data-product], href="/products/...") and cart lines.
      function resolveProductId(el) {
        var cur = el;
        while (cur && cur !== d.body) {
          var attr = cur.getAttribute('data-product-id') || cur.getAttribute('data-product');
          if (attr) return String(attr).split('/').pop();
          if (cur.tagName === 'A') {
            var href = cur.getAttribute('href') || '';
            var m = href.match(/\/products\/([^/?#]+)/);
            if (m) return m[1]; // handle, not numeric id — handled below
          }
          // Cart line items often carry data-variant-id; skip those (can't map to product id easily)
          cur = cur.parentElement;
        }
        return null;
      }

      // Skip fixed-amount DOM adjustment when visitor sees a market-converted currency.
      if (adjType === 'fixed') {
        var rate = w.Shopify && w.Shopify.currency && parseFloat(w.Shopify.currency.rate);
        if (rate && rate !== 1) return;
      }

      // Universal price regex handles both dot-decimal (€520.95, 1,234.56)
      // and comma-decimal (€520,95, 1.234,56) in a single pass.
      var priceRe = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/;
      // Fallback for integer prices (e.g. €520 with no decimal part)
      var moneyFmtComma = ((w.Shopify && w.Shopify.money_format) || '').indexOf('comma_separator') !== -1;

      // Detect format from the matched string itself: whichever separator comes
      // last is the decimal separator (e.g. "1.234,56" → comma; "1,234.56" → dot).
      function isCommaDecimalStr(str) {
        var lc = str.lastIndexOf(','), ld = str.lastIndexOf('.');
        if (lc === -1 && ld === -1) return moneyFmtComma;
        return lc > ld;
      }
      function parsePrice(str) {
        return isCommaDecimalStr(str)
          ? parseFloat(str.replace(/\./g, '').replace(',', '.'))
          : parseFloat(str.replace(/,/g, ''));
      }
      function fmtPrice(n, isComma) {
        var s = n.toFixed(2);
        return isComma ? s.replace('.', ',') : s;
      }

      var sels = ['.price__regular .price-item--regular', '.price__sale .price-item--sale', '.price-item', '[data-product-price]', '.product__price'];

      // Collect unique matching elements
      var seen = new WeakSet();
      var candidates = [];
      sels.forEach(function(sel) {
        d.querySelectorAll(sel).forEach(function(el) {
          if (!seen.has(el)) { seen.add(el); candidates.push(el); }
        });
      });

      // Only process leaf-level elements (skip any element that contains another matched
      // price element as a descendant) to prevent the same price being modified twice.
      candidates.forEach(function(el) {
        for (var si = 0; si < sels.length; si++) {
          if (el.querySelector(sels[si])) return;
        }

        // If we're NOT on the target product's PDP, verify this element belongs to that product.
        if (targetId && !pdpProductId) {
          var elProductId = resolveProductId(el);
          if (elProductId && elProductId !== targetId) return; // belongs to a different product
          // If we can't resolve at all, skip — safer than modifying wrong prices.
          if (!elProductId) return;
        }

        var text = el.textContent || '';
        var match = text.match(priceRe);
        if (!match) return;
        var matchStr = match[0];
        var isComma = isCommaDecimalStr(matchStr);
        var raw = parsePrice(matchStr);
        if (isNaN(raw) || raw <= 0) return;
        var adj = adjType === 'percent' ? raw * (1 - adjValue / 100) : raw - adjValue;
        if (adj < 0) adj = 0;
        el.textContent = text.replace(matchStr, fmtPrice(adj, isComma));
      });
    }

    function applyContentVariants() {
      var sectionTypes = { SECTION: 1, PAGE: 1 };
      for (var ci = 0; ci < exps.length; ci++) {
        var eC = exps[ci];
        if (!sectionTypes[eC.type]) continue;
        var cVId = asgn[eC.id];
        if (!cVId) continue;
        var cVars = eC.variants || [], cV = null;
        for (var cj = 0; cj < cVars.length; cj++) { if (cVars[cj].id === cVId) { cV = cVars[cj]; break; } }

        // CSS selector approach — no theme editing required
        if (eC.targetSelector) {
          try {
            var targets = d.querySelectorAll(eC.targetSelector);
            for (var ct = 0; ct < targets.length; ct++) {
              if (cV && cV.content && !cV.isControl) targets[ct].innerHTML = cV.content;
            }
          } catch (e) { /* invalid selector — skip */ }
        }

        // Legacy: data-spt-section attribute fallback
        var els = d.querySelectorAll('[data-spt-section="' + eC.id + '"]');
        for (var cp = 0; cp < els.length; cp++) {
          if (cV && cV.content && !cV.isControl) els[cp].innerHTML = cV.content;
          els[cp].style.visibility = '';
        }
      }
      // Reveal any legacy unmatched containers
      var all = d.querySelectorAll('[data-spt-section]');
      for (var cq = 0; cq < all.length; cq++) { all[cq].style.visibility = ''; }
    }

    function init() {
      applyContentVariants();
      sendPageView();
      syncCart();
      confirmAssign();
      applyPriceAdj();
      trackAtc();
      trackCheckout();
    }

    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  /* ── entry: inline config or API fetch ───────────────────────────── */
  var inline = w.__SPT_CFG_INLINE__;
  if (inline && (inline.experiments || []).length) {
    run(inline);
  } else {
    fetch(APP_URL + '/api/config/' + encodeURIComponent(shop))
      .then(function (r) { return r.json(); })
      .then(function (cfg) { if (cfg && cfg.experiments) run(cfg); })
      .catch(function () {});
  }

})(window, document);
