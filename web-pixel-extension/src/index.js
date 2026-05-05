/**
 * Split Test Web Pixel Extension
 *
 * Tracks checkout funnel events and sends them to our /api/events endpoint.
 * Runs in a sandboxed iframe — cannot access window, cookies, or localStorage.
 *
 * Attribution bridge:
 *   split-test-events.js sets _spt_vid and _spt_asgn as cart attributes before
 *   checkout. Those attributes flow through to checkout_completed event data,
 *   where we read them for server-side order attribution.
 *
 * Consent:
 *   This pixel is registered under analytics = true.
 *   Shopify only fires it for visitors who consent to analytics cookies.
 */

/* ── helpers ───────────────────────────────────────────────────── */

let apiUrl = '';
let shopDomain = '';

function send(type, payload) {
  if (!apiUrl) return;
  const url = `${apiUrl}/api/events`;
  const body = JSON.stringify({ type, shopDomain, ts: Date.now(), ...payload });

  // sendBeacon is available in the Web Pixel sandbox
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  }
}

function getCartAttrs(checkout) {
  const attrs = checkout?.attributes ?? checkout?.customAttributes ?? [];
  const map = {};
  for (const { key, value } of attrs) {
    map[key] = value;
  }
  return map;
}

function parseAssignments(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function getDeviceFromContext(context) {
  const ua = context?.navigator?.userAgent ?? '';
  if (/Mobi|Android/i.test(ua)) return 'mobile';
  if (/Tablet|iPad/i.test(ua)) return 'tablet';
  return 'desktop';
}

/* ── init ──────────────────────────────────────────────────────── */

analytics.subscribe('init', (event) => {
  // apiUrl is passed when the app registers the pixel via webPixelCreate mutation
  const settings = JSON.parse(event.data.settings || '{}');
  apiUrl = (settings.apiUrl || '').replace(/\/$/, '');
  shopDomain = event.data.shop?.myshopifyDomain ?? '';
});

/* ── page_viewed ───────────────────────────────────────────────── */
// Note: the embed script also sends PAGE_VIEW; the web pixel version
// is used as a cross-check and for checkout page views where the embed
// might not be present.
analytics.subscribe('page_viewed', (event) => {
  const context = event.context ?? {};
  send('PAGE_VIEW', {
    pageUrl: context.document?.location?.href ?? '',
    device: getDeviceFromContext(context),
    referrer: context.document?.referrer ?? '',
    utmSource: context.navigator?.language ?? '',
  });
});

/* ── product_added_to_cart ─────────────────────────────────────── */
analytics.subscribe('product_added_to_cart', (event) => {
  const cartLine = event.data?.cartLine;
  send('ADD_TO_CART', {
    productId: cartLine?.merchandise?.product?.id ?? '',
    variantId: cartLine?.merchandise?.id ?? '',
    quantity: cartLine?.quantity ?? 1,
    price: cartLine?.cost?.totalAmount?.amount ?? 0,
    currency: cartLine?.cost?.totalAmount?.currencyCode ?? '',
  });
});

/* ── checkout_started ──────────────────────────────────────────── */
analytics.subscribe('checkout_started', (event) => {
  const checkout = event.data?.checkout;
  const attrs = getCartAttrs(checkout);

  send('INITIATE_CHECKOUT', {
    visitorId: attrs._spt_vid ?? '',
    assignments: parseAssignments(attrs._spt_asgn),
    checkoutToken: checkout?.token ?? '',
    totalPrice: checkout?.totalPrice?.amount ?? 0,
    currency: checkout?.totalPrice?.currencyCode ?? '',
    lineItemCount: checkout?.lineItems?.length ?? 0,
  });
});

/* ── checkout_completed ────────────────────────────────────────── */
// This is the critical event for revenue attribution.
// We send the full order data so the server can reconcile against webhooks.
analytics.subscribe('checkout_completed', (event) => {
  const checkout = event.data?.checkout;
  const order = event.data?.checkout?.order;
  const attrs = getCartAttrs(checkout);

  send('PURCHASE', {
    visitorId: attrs._spt_vid ?? '',
    assignments: parseAssignments(attrs._spt_asgn),
    shopifyOrderId: order?.id ?? '',
    shopifyOrderGid: order?.id ?? '',
    checkoutToken: checkout?.token ?? '',
    revenue: checkout?.totalPrice?.amount ?? 0,
    currency: checkout?.totalPrice?.currencyCode ?? '',
    itemCount: checkout?.lineItems?.length ?? 0,
    // Include line items for outlier-capping (Phase 3)
    lineItems: (checkout?.lineItems ?? []).map((li) => ({
      productId: li.variant?.product?.id ?? '',
      variantId: li.variant?.id ?? '',
      quantity: li.quantity ?? 1,
      price: li.variant?.price?.amount ?? 0,
    })),
  });
});

/* ── search_submitted ──────────────────────────────────────────── */
analytics.subscribe('search_submitted', (event) => {
  send('CUSTOM', {
    subtype: 'search',
    query: event.data?.searchResult?.query ?? '',
  });
});
