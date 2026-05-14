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
      // 1. Form submit to /checkout
      d.addEventListener('submit', function(e) {
        var action = (e.target && (e.target.action || e.target.getAttribute('action'))) || '';
        if (action.indexOf('/checkout') !== -1) sendCheckout();
      }, true);

      // 2. Click on checkout links/buttons
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

    /* sync assignment to cart attribute so Cart Transform function can read it */
    function syncCartAttr() {
      var hasPriceExp = exps.some(function(e) { return e.type === 'PRICE' && asgn[e.id]; });
      if (!hasPriceExp) return;
      var root = marketRoot().replace(/\/$/, '');
      fetch(root + '/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: { spt_asgn: JSON.stringify(asgn) } }),
      }).catch(function() {});
    }

    /*
     * Intercept "Buy Now" on PRICE experiment product pages.
     * Dynamic checkout buttons bypass the cart, so spt_asgn never gets set.
     * We intercept checkout form submissions, add the item to cart first,
     * write spt_asgn, then redirect to checkout.
     */
    function interceptBuyNow() {
      var canonicalPath = stripMarket(location.pathname);
      if (!/^\/products\//.test(canonicalPath)) return;

      var hasPriceOnPage = exps.some(function(e) {
        return e.type === 'PRICE' && asgn[e.id] &&
               e.targetProductHandle && canonicalPath.indexOf(e.targetProductHandle) !== -1;
      });
      if (!hasPriceOnPage) return;

      d.addEventListener('submit', function(ev) {
        var form = ev.target;
        if (!form || form.tagName !== 'FORM') return;

        // Detect checkout-bound submissions:
        // - form action contains /checkout
        // - OR form has a submit button/input with name="checkout"
        var action = (form.getAttribute('action') || '').toLowerCase();
        var hasCheckoutBtn = !!form.querySelector('[name="checkout"][type="submit"],[name="checkout"][type="image"]');
        if (action.indexOf('/checkout') === -1 && !hasCheckoutBtn) return;

        var variantInput = form.querySelector('[name="id"]');
        if (!variantInput) return; // not a product form — let it proceed

        ev.preventDefault();
        ev.stopImmediatePropagation();

        var variantId = variantInput.value;
        var qtyInput = form.querySelector('[name="quantity"]');
        var qty = qtyInput ? Number(qtyInput.value) || 1 : 1;
        var root = marketRoot().replace(/\/$/, '');

        // Collect any line properties from the form
        var props = {};
        var propInputs = form.querySelectorAll('[name^="properties["]');
        for (var pi = 0; pi < propInputs.length; pi++) {
          var propName = propInputs[pi].name.replace(/^properties\[/, '').replace(/\]$/, '');
          props[propName] = propInputs[pi].value;
        }

        fetch(root + '/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: variantId, quantity: qty, properties: props }),
        })
        .then(function() {
          return fetch(root + '/cart/update.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attributes: { spt_asgn: JSON.stringify(asgn) } }),
          });
        })
        .then(function() { location.href = withMarket('/checkout'); })
        .catch(function() { location.href = withMarket('/checkout'); });
      }, true);
    }

    /* ── Price display ───────────────────────────────────────────────── */
    // Selectors covering Dawn, Debut, Brooklyn, Sense, Craft and most popular themes.
    // On PDP these elements are server-rendered so no timing issue.
    var PRICE_SELECTORS = [
      '[data-spt-price]',           // our own data attribute (if merchant adds it)
      '.price-item--regular',       // Dawn + most modern themes
      '.price__regular .money',
      '.price__sale .price-item--sale',
      '[data-product-price]',       // many themes
      '.product__price .money',     // Debut
      '.product-single__price',     // Brooklyn
      '.product__price',
    ].join(',');

    var CART_PRICE_SELECTORS = [
      '[data-spt-price]',
      '.price--end',                          // Dawn cart drawer + cart page
      '.cart-item__price-wrapper .price',     // Dawn
      '.cart-item__price .price-item',
      '.cart__price',
      '[data-cart-item-price]',
      '.cart-item .money',
      '.cart__product-price',
    ].join(',');

    function calcAdjustedCents(originalCents, adjType, adjValue) {
      var n = adjType === 'percent'
        ? originalCents * (1 + adjValue / 100)
        : originalCents + adjValue * 100;
      return Math.max(0, Math.round(n));
    }

    function formatMoney(cents) {
      var fmt = w.__SPT_MONEY_FMT__;
      if (fmt && w.Shopify && w.Shopify.formatMoney) return w.Shopify.formatMoney(cents, fmt);
      if (w.Shopify && w.Shopify.formatMoney) return w.Shopify.formatMoney(cents, '{{amount}}');
      var amount = (cents / 100).toFixed(2).replace(/\.00$/, '');
      return fmt ? fmt.replace('{{amount}}', amount).replace('{{amount_no_decimals}}', Math.round(cents/100))
                     .replace('{{amount_with_comma_separator}}', amount)
                 : '$' + amount;
    }

    function applyPriceToElements(els, adjType, adjValue) {
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        // Store original text once
        if (!el.dataset.sptOrig) el.dataset.sptOrig = el.textContent.trim();
        // Parse cents from original text (strip non-numeric except dot/comma)
        var raw = el.dataset.sptOrig.replace(/[^0-9.,]/g, '').replace(',', '.');
        var originalCents = Math.round(parseFloat(raw) * 100);
        if (!originalCents || isNaN(originalCents)) continue;
        var newCents = calcAdjustedCents(originalCents, adjType, adjValue);
        el.textContent = formatMoney(newCents);
      }
    }

    function applyPriceDisplay() {
      var canonicalPath = stripMarket(location.pathname);

      for (var pi = 0; pi < exps.length; pi++) {
        var ep = exps[pi];
        if (ep.type !== 'PRICE') continue;
        var pvId = asgn[ep.id];
        if (!pvId) continue;

        // Find assigned variant config
        var pv = null;
        for (var pj = 0; pj < (ep.variants || []).length; pj++) {
          if (ep.variants[pj].id === pvId) { pv = ep.variants[pj]; break; }
        }
        if (!pv || pv.isControl || !pv.priceAdjType || pv.priceAdjValue == null) continue;

        var handle = ep.targetProductHandle;
        if (!handle) continue;

        // PDP — only apply on the matching product page
        var onPdp = /^\/products\//.test(canonicalPath) &&
                    canonicalPath.indexOf(handle) !== -1;
        if (onPdp) {
          var pdpEls = d.querySelectorAll(PRICE_SELECTORS);
          applyPriceToElements(pdpEls, pv.priceAdjType, pv.priceAdjValue);
        }

        // Product cards on any page — look for cards linked to this product
        var cards = d.querySelectorAll('a[href*="/products/' + handle + '"]');
        for (var ci = 0; ci < cards.length; ci++) {
          var card = cards[ci].closest('.product-card, .card-wrapper, .grid__item, [class*="product"]') || cards[ci].parentElement;
          if (!card) continue;
          var cardEls = card.querySelectorAll(PRICE_SELECTORS);
          applyPriceToElements(cardEls, pv.priceAdjType, pv.priceAdjValue);
        }

      }
    }

    // Fetch cart.js and update prices for matching line items
    function applyCartPriceDisplay() {
      var hasPriceExp = exps.some(function(e) { return e.type === 'PRICE' && asgn[e.id]; });
      if (!hasPriceExp) return;

      var root = marketRoot().replace(/\/$/, '');
      fetch(root + '/cart.js')
        .then(function(r) { return r.json(); })
        .then(function(cart) {
          var items = cart.items || [];
          for (var ii = 0; ii < items.length; ii++) {
            var item = items[ii];
            for (var pi = 0; pi < exps.length; pi++) {
              var ep = exps[pi];
              if (ep.type !== 'PRICE' || item.handle !== ep.targetProductHandle) continue;
              var pvId = asgn[ep.id];
              if (!pvId) continue;
              var pv = null;
              for (var pj = 0; pj < (ep.variants || []).length; pj++) {
                if (ep.variants[pj].id === pvId) { pv = ep.variants[pj]; break; }
              }
              if (!pv || pv.isControl || !pv.priceAdjType || pv.priceAdjValue == null) continue;

              // item.price is already in cents — no parsing needed
              var newCents = calcAdjustedCents(item.price, pv.priceAdjType, pv.priceAdjValue);
              var formatted = formatMoney(newCents);

              // Find cart item element — scope to a known cart container first
              // to avoid matching PDP elements like pickup-availability
              var variantId = String(item.variant_id);
              var lineKey = String(item.key);
              var lineIndex = ii + 1;
              var cartContainerSel = 'cart-drawer-items, #cart-items, .cart__items, cart-drawer, #CartDrawer, .cart-drawer';
              var cartRoot = d.querySelector(cartContainerSel);
              var cartItemEl = null;
              if (cartRoot) {
                cartItemEl =
                  cartRoot.querySelector('#CartItem-' + lineIndex) ||
                  cartRoot.querySelector('[data-cart-item-key="' + lineKey + '"]') ||
                  cartRoot.querySelector('[data-variant-id="' + variantId + '"]');
              }
              // Global fallback (cart page)
              if (!cartItemEl) {
                cartItemEl =
                  d.querySelector('#CartItem-' + lineIndex) ||
                  d.querySelector('tr.cart-item:nth-of-type(' + lineIndex + ')');
              }
              // Link fallback
              if (!cartItemEl) {
                var link = d.querySelector('a[href*="/products/' + item.handle + '"]');
                if (link) cartItemEl = link.closest('.cart-item, [data-cart-item], .cart__item, cart-drawer-items > *');
              }

              if (!cartItemEl) continue;
              var priceEls = cartItemEl.querySelectorAll(CART_PRICE_SELECTORS);
              for (var i = 0; i < priceEls.length; i++) {
                priceEls[i].textContent = formatted;
              }
            }
          }
        })
        .catch(function() {});
    }

    // Watch cart drawer for DOM updates, then re-apply cart prices
    function watchCartUpdates() {
      var hasPriceExp = exps.some(function(e) { return e.type === 'PRICE' && asgn[e.id]; });
      if (!hasPriceExp) return;

      function onCartUpdate() { setTimeout(applyCartPriceDisplay, 50); }

      // Dawn: observe the cart-drawer custom element for childList changes
      var cartRoot = d.querySelector('cart-drawer, #cart-drawer, #CartDrawer, .cart-drawer');
      if (cartRoot) {
        new MutationObserver(onCartUpdate).observe(cartRoot, { childList: true, subtree: true });
      }
      d.addEventListener('cart:updated', onCartUpdate);
      d.addEventListener('cart:refresh', onCartUpdate);
      d.addEventListener('items-added', onCartUpdate);
    }

    function init() {
      applyContentVariants();
      applyPriceDisplay();
      applyCartPriceDisplay();
      watchCartUpdates();
      syncCartAttr();
      interceptBuyNow();
      sendPageView();
      confirmAssign();
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
