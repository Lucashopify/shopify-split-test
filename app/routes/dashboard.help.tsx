import type React from "react";

const S = {
  page: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "2.5rem 2rem 4rem",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#111",
    fontSize: "0.875rem",
    lineHeight: 1.65,
  } as React.CSSProperties,

  header: {
    marginBottom: "2.5rem",
    paddingBottom: "1.25rem",
    borderBottom: "1px solid #e9e9e9",
  },

  h1: {
    fontSize: "1.375rem",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.02em",
  },

  subtitle: {
    color: "#888",
    marginTop: "0.375rem",
    fontSize: "0.8125rem",
  },

  toc: {
    background: "#f8f8f8",
    borderRadius: 8,
    padding: "1rem 1.25rem",
    marginBottom: "2.5rem",
    fontSize: "0.8125rem",
  },

  tocTitle: {
    fontWeight: 600,
    fontSize: "0.75rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#888",
    marginBottom: "0.5rem",
  },

  tocItem: {
    display: "block",
    color: "#444",
    textDecoration: "none",
    padding: "0.15rem 0",
  },

  section: {
    marginBottom: "2.5rem",
  },

  h2: {
    fontSize: "1rem",
    fontWeight: 700,
    margin: "0 0 0.75rem",
    letterSpacing: "-0.015em",
    paddingTop: "0.25rem",
  },

  h3: {
    fontSize: "0.875rem",
    fontWeight: 600,
    margin: "1.25rem 0 0.5rem",
    color: "#333",
  },

  p: {
    margin: "0 0 0.75rem",
    color: "#333",
  },

  ol: {
    margin: "0 0 0.75rem",
    paddingLeft: "1.4rem",
    color: "#333",
  },

  ul: {
    margin: "0 0 0.75rem",
    paddingLeft: "1.4rem",
    color: "#333",
  },

  li: {
    marginBottom: "0.3rem",
  },

  callout: (color: "blue" | "yellow" | "green" | "red") => {
    const map = {
      blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
      yellow: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
      green: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
      red: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
    };
    const c = map[color];
    return {
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 6,
      padding: "0.75rem 1rem",
      marginBottom: "1rem",
      color: c.text,
      fontSize: "0.8125rem",
    } as React.CSSProperties;
  },

  divider: {
    height: 1,
    background: "#e9e9e9",
    margin: "2rem 0",
  },

  code: {
    background: "#f3f3f3",
    borderRadius: 4,
    padding: "0.15em 0.4em",
    fontFamily: "monospace",
    fontSize: "0.82em",
    color: "#333",
  } as React.CSSProperties,

  codeBlock: {
    background: "#1e1e1e",
    color: "#d4d4d4",
    borderRadius: 6,
    padding: "1rem 1.125rem",
    fontFamily: "monospace",
    fontSize: "0.8rem",
    overflowX: "auto" as const,
    margin: "0.5rem 0 1rem",
    lineHeight: 1.6,
    whiteSpace: "pre" as const,
  },

  toggle: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#5b5bd6",
    fontSize: "0.8125rem",
    padding: 0,
    textDecoration: "underline",
    marginBottom: "0.5rem",
  } as React.CSSProperties,

  badge: (color: "purple" | "gray") => ({
    display: "inline-block",
    fontSize: "0.6875rem",
    fontWeight: 600,
    padding: "0.125rem 0.5rem",
    borderRadius: 99,
    background: color === "purple" ? "#ede9fe" : "#f3f3f3",
    color: color === "purple" ? "#6d28d9" : "#666",
    marginLeft: "0.4rem",
    verticalAlign: "middle",
  } as React.CSSProperties),

  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "0.8125rem",
    marginBottom: "1rem",
  },

  th: {
    textAlign: "left" as const,
    padding: "0.4rem 0.6rem",
    background: "#f8f8f8",
    borderBottom: "1px solid #e9e9e9",
    fontWeight: 600,
    color: "#555",
  },

  td: {
    padding: "0.4rem 0.6rem",
    borderBottom: "1px solid #f0f0f0",
    color: "#333",
    verticalAlign: "top" as const,
  },
};

export default function HelpPage() {
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Help & Documentation</h1>
        <p style={S.subtitle}>Everything you need to run A/B experiments on your Shopify store.</p>
      </div>

      {/* Table of contents */}
      <div style={S.toc}>
        <div style={S.tocTitle}>On this page</div>
        <a href="#experiment-types" style={S.tocItem}>Experiment types</a>
        <a href="#price-testing-plus" style={S.tocItem}>Price testing: Shopify Plus</a>
        <a href="#price-testing-non-plus" style={S.tocItem}>Price testing: non-Plus stores</a>
        <a href="#theme-compatibility" style={S.tocItem}>Theme compatibility</a>
        <a href="#metrics" style={S.tocItem}>How metrics are tracked</a>
        <a href="#guardrails" style={S.tocItem}>Guardrails & auto-pause</a>
        <a href="#price-limitations" style={S.tocItem}>Price testing: known limitations</a>
        <a href="#faq" style={S.tocItem}>FAQ</a>
      </div>

      {/* Experiment types */}
      <div style={S.section} id="experiment-types">
        <h2 style={S.h2}>Experiment types</h2>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Type</th>
              <th style={S.th}>What it tests</th>
              <th style={S.th}>Requirement</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.td}><strong>Theme</strong></td>
              <td style={S.td}>Any visual change (layout, copy, images, colors) via Shopify theme versions</td>
              <td style={S.td}>Any plan</td>
            </tr>
            <tr>
              <td style={S.td}><strong>URL Redirect</strong></td>
              <td style={S.td}>Sends a percentage of visitors to a different URL (e.g. alternate product page)</td>
              <td style={S.td}>Any plan</td>
            </tr>
            <tr>
              <td style={S.td}><strong>Price</strong><span style={S.badge("purple")}>Plus only</span></td>
              <td style={S.td}>Tests a different price for a product at checkout using Shopify's Cart Transform API</td>
              <td style={S.td}>Shopify Plus</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={S.divider} />

      {/* Price testing - Plus */}
      <div style={S.section} id="price-testing-plus">
        <h2 style={S.h2}>
          Price testing: Shopify Plus
          <span style={S.badge("purple")}>Plus only</span>
        </h2>

        <p style={S.p}>
          Price experiments use Shopify's <strong>Cart Transform API</strong> to modify the actual checkout price server-side, no discount codes, no workarounds. The customer sees the test price in their cart and at checkout, and pays that price.
        </p>

        <div style={S.callout("blue")}>
          <strong>How it works:</strong> When a visitor is assigned to the test variant, our theme script sets the displayed price on the product page. When they add to cart, a hidden line property records their variant assignment. Our Cart Transform function reads that property and adjusts the price before checkout is finalized.
        </div>

        <h3 style={S.h3}>Step 1: Create the experiment</h3>
        <ol style={S.ol}>
          <li style={S.li}>Go to <strong>Experiments → New experiment</strong></li>
          <li style={S.li}>Select <strong>Price test</strong></li>
          <li style={S.li}>Choose the product and enter the test price</li>
          <li style={S.li}>Set traffic split and launch</li>
        </ol>

        <h3 style={S.h3}>Step 2: Theme setup (required)</h3>
        <p style={S.p}>
          The price script needs to know which HTML elements to update on your product page and in the cart. For themes we support out of the box, this is automatic. For custom themes, you or your developer needs to add two data attributes.
        </p>

        <p style={S.p}>Jump to <a href="#theme-compatibility" style={{ color: "#5b5bd6" }}>Theme compatibility</a> for the full list and setup instructions.</p>

        <h3 style={S.h3}>What the customer sees</h3>
        <ul style={S.ul}>
          <li style={S.li}><strong>Product page:</strong> The test price is displayed instead of the original.</li>
          <li style={S.li}><strong>Cart:</strong> The test price appears on the line item. The original price is hidden.</li>
          <li style={S.li}><strong>Checkout:</strong> The test price is the actual charged price (via Cart Transform).</li>
        </ul>
      </div>

      <div style={S.divider} />

      {/* Price testing - non-Plus */}
      <div style={S.section} id="price-testing-non-plus">
        <h2 style={S.h2}>Price testing: non-Plus stores</h2>

        <div style={S.callout("yellow")}>
          <strong>Cart Transform is Shopify Plus only.</strong> Without it, you cannot change the actual checkout price server-side. The workaround below lets you test prices without Plus by using a duplicate product.
        </div>

        <p style={S.p}>
          This is the same approach used by leading CRO tools. It requires a bit more setup but works on any Shopify plan.
        </p>

        <h3 style={S.h3}>How it works</h3>
        <p style={S.p}>
          You create a duplicate of your product with the test price set directly on it in Shopify Admin. You then run a <strong>URL Redirect</strong> experiment that sends a portion of visitors to the duplicate product URL. Since the price is set on the product itself, Shopify handles checkout normally, no Cart Transform needed.
        </p>

        <h3 style={S.h3}>Step-by-step setup</h3>
        <ol style={S.ol}>
          <li style={S.li}>
            <strong>Duplicate the product in Shopify Admin</strong><br />
            <span style={{ color: "#666" }}>Go to Products → find your product → click the "…" menu → Duplicate. Give it a name like "Product Name - Price Test".</span>
          </li>
          <li style={S.li}>
            <strong>Set the test price on the duplicate</strong><br />
            <span style={{ color: "#666" }}>On the duplicate product, change the price to your test price. Leave everything else the same.</span>
          </li>
          <li style={S.li}>
            <strong>Hide the duplicate from collections and search</strong><br />
            <span style={{ color: "#666" }}>In the duplicate product's Sales Channels settings, set it to <em>unavailable</em> in Online Store search. Remove it from all collections. You want it accessible only via direct URL.</span>
          </li>
          <li style={S.li}>
            <strong>Copy the duplicate product URL</strong><br />
            <span style={{ color: "#666" }}>The URL will look like <code style={S.code}>/products/your-product-name-price-test</code>. Copy it.</span>
          </li>
          <li style={S.li}>
            <strong>Create a URL Redirect experiment in Arktic</strong><br />
            <span style={{ color: "#666" }}>
              Go to <strong>New experiment → URL Redirect</strong>.<br />
              Set the <strong>source URL</strong> to your original product page (e.g. <code style={S.code}>/products/your-product</code>).<br />
              Set the <strong>destination URL</strong> to the duplicate (e.g. <code style={S.code}>/products/your-product-name-price-test</code>).<br />
              Set your traffic split (e.g. 50/50).
            </span>
          </li>
          <li style={S.li}>
            <strong>Launch and monitor</strong><br />
            <span style={{ color: "#666" }}>The experiment will send the test percentage of visitors to the duplicate product page, where they'll see and pay the test price.</span>
          </li>
        </ol>

        <div style={S.callout("green")}>
          <strong>Tip:</strong> When the experiment ends, either delete or archive the duplicate product to keep your catalog clean. If the test price wins, update the original product price and you're done.
        </div>

        <h3 style={S.h3}>Limitations vs Plus price testing</h3>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Feature</th>
              <th style={S.th}>Non-Plus (URL Redirect)</th>
              <th style={S.th}>Plus (Cart Transform)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.td}>Works on any plan</td>
              <td style={S.td}>Yes</td>
              <td style={S.td}>Plus only</td>
            </tr>
            <tr>
              <td style={S.td}>True server-side price</td>
              <td style={S.td}>Yes (set on product)</td>
              <td style={S.td}>Yes (Cart Transform)</td>
            </tr>
            <tr>
              <td style={S.td}>Same product URL for all visitors</td>
              <td style={S.td}>No (different URLs)</td>
              <td style={S.td}>Yes</td>
            </tr>
            <tr>
              <td style={S.td}>Works with direct links / ads</td>
              <td style={S.td}>Only for organic traffic</td>
              <td style={S.td}>Yes</td>
            </tr>
            <tr>
              <td style={S.td}>SEO risk</td>
              <td style={S.td}>Low (duplicate hidden)</td>
              <td style={S.td}>None</td>
            </tr>
            <tr>
              <td style={S.td}>Setup complexity</td>
              <td style={S.td}>Manual (5 steps)</td>
              <td style={S.td}>Automated</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={S.divider} />

      {/* Theme compatibility */}
      <div style={S.section} id="theme-compatibility">
        <h2 style={S.h2}>Theme compatibility</h2>

        <p style={S.p}>
          Price experiments update prices on the page by injecting into specific HTML elements. For this to work correctly, the script needs to find the right elements on your product page and in your cart.
        </p>

        <h3 style={S.h3}>Supported themes (automatic setup)</h3>
        <p style={S.p}>The following Shopify-owned themes are supported out of the box, no setup needed:</p>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "0.375rem", marginBottom: "1rem" }}>
          {["Dawn", "Sense", "Craft", "Crave", "Colorblock", "Refresh", "Studio", "Origin", "Spotlight", "Ride", "Expression", "Habitat", "Presence", "Publisher"].map((t) => (
            <span key={t} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.75rem", fontWeight: 500 }}>{t}</span>
          ))}
        </div>

        <h3 style={S.h3}>Custom / third-party themes</h3>
        <p style={S.p}>
          If you're using a theme not in the list above, you or your developer needs to add two <code style={S.code}>data-</code> attributes to your theme's Liquid files. This is a one-time setup.
        </p>
        <p style={S.p}>Not a developer? <strong>Contact us</strong> and we'll set it up for you at no charge.</p>

        <h3 style={S.h3}>For developers</h3>
        <p style={S.p}>Add these two attributes to the relevant elements in your theme:</p>

        <p style={{ ...S.p, fontWeight: 600, marginBottom: "0.25rem" }}>1. Product page price element</p>
        <p style={S.p}>Find the element that displays the product price on the PDP and add <code style={S.code}>data-spt-price</code>:</p>
        <div style={S.codeBlock}>{`<!-- Example: in your product price snippet -->
<span class="price__current" data-spt-price>{{ product.price | money }}</span>`}</div>

        <p style={{ ...S.p, fontWeight: 600, marginBottom: "0.25rem" }}>2. Cart line item price element</p>
        <p style={S.p}>Find the element that displays the price for each line item in the cart (drawer or page) and add <code style={S.code}>data-spt-cart-price</code>:</p>
        <div style={S.codeBlock}>{`<!-- Example: in your cart line items snippet -->
<span class="cart-item__price" data-spt-cart-price>{{ item.final_price | money }}</span>`}</div>

        <div style={S.callout("blue")}>
          <strong>Note:</strong> These attributes are only used by Arktic's price experiment script; they have no effect on your theme's normal behavior and are safe to add.
        </div>
      </div>

      <div style={S.divider} />

      {/* Metrics */}
      <div style={S.section} id="metrics">
        <h2 style={S.h2}>How metrics are tracked</h2>

        <h3 style={S.h3}>What counts as a session?</h3>
        <p style={S.p}>
          A session is recorded when a visitor views a page while assigned to an experiment variant.
        </p>
        <ul style={S.ul}>
          <li style={S.li}><strong>Theme / URL Redirect experiments:</strong> Any page view on your store.</li>
          <li style={S.li}><strong>Price experiments:</strong> Only page views on the tested product's page (e.g. <code style={S.code}>/products/my-product</code>). Visitors who never land on the PDP are not counted.</li>
        </ul>

        <h3 style={S.h3}>Add to Cart rate</h3>
        <ul style={S.ul}>
          <li style={S.li}><strong>Theme / URL Redirect:</strong> All ATC events across the store.</li>
          <li style={S.li}><strong>Price experiments:</strong> Only ATC events on the tested product page. Adding unrelated products doesn't count.</li>
        </ul>

        <h3 style={S.h3}>Checkout rate</h3>
        <p style={S.p}>Checkout rate is shown for Theme and URL Redirect experiments. It is not shown for price experiments because checkout happens from the cart page, not the product page, so it can't be reliably attributed to the product being tested.</p>

        <h3 style={S.h3}>Conversions (orders)</h3>
        <p style={S.p}>An order is counted as a conversion when the visitor who was assigned to a variant completes a purchase. For price experiments this includes any order from that visitor, not just the tested product.</p>

        <h3 style={S.h3}>Statistical significance</h3>
        <p style={S.p}>
          We use a two-proportion z-test to compute p-values comparing each treatment variant against the control. A result is considered statistically significant at <strong>p &lt; 0.05</strong>. Results are shown with a confidence indicator in the results table.
        </p>

        <h3 style={S.h3}>Revenue per visitor (RPV)</h3>
        <p style={S.p}>Total revenue divided by sessions. This is often the most important metric for e-commerce experiments. A variant with a lower conversion rate can still win if it drives higher order values.</p>
      </div>

      <div style={S.divider} />

      {/* Guardrails */}
      <div style={S.section} id="guardrails">
        <h2 style={S.h2}>Guardrails & auto-pause</h2>

        <p style={S.p}>Arktic monitors your experiments for data quality issues and protects your revenue. Two guardrails can automatically pause an experiment:</p>

        <h3 style={S.h3}>Sample Ratio Mismatch (SRM)</h3>
        <p style={S.p}>
          SRM fires when visitor allocation doesn't match the configured traffic split. For example, if you set 50/50 but one variant receives 65% of visitors, something is wrong with the assignment mechanism. We run a chi-squared test and flag SRM when p &lt; 0.01 (after each variant has at least 100 visitors).
        </p>
        <div style={S.callout("yellow")}>
          SRM usually means a caching issue, bot traffic, or a redirect that bypasses the experiment script. Check your CDN/cache settings and make sure the experiment script loads on every page.
        </div>

        <h3 style={S.h3}>Control CVR drop</h3>
        <p style={S.p}>
          If the control variant's conversion rate drops more than 20% from its first-hour baseline (after at least 200 sessions), the experiment is paused. This protects against cases where the experiment itself is harming the control experience.
        </p>

        <h3 style={S.h3}>Novelty effect detection</h3>
        <p style={S.p}>
          After 3+ days of data, Arktic checks whether a treatment variant's early conversion rate (first 48h) is 40% or more higher than its later rate. If so, the experiment is flagged (not paused). The early lift may be due to novelty rather than a real improvement. Check back after more data accumulates before concluding.
        </p>
      </div>

      <div style={S.divider} />

      <div style={S.divider} />

      {/* Price testing limitations */}
      <div style={S.section} id="price-limitations">
        <h2 style={S.h2}>Price testing: known limitations</h2>
        <p style={S.p}>
          Price experiments work well for most standard Shopify stores, but there are a few setups where things break down. Check these before launching a price test.
        </p>

        <h3 style={S.h3}>Multiple currencies</h3>
        <p style={S.p}>
          If your store uses Shopify Markets or a third-party multi-currency tool (e.g. Global-E), price tests are not supported. Our Cart Transform applies the price adjustment in your store's base currency. When Shopify converts that to a foreign currency, the displayed price and the checkout price can diverge: visitors may see one number and be charged another. Do not run price tests if your store sells in more than one currency.
        </p>

        <h3 style={S.h3}>Subscription products</h3>
        <p style={S.p}>
          Shopify does not allow Cart Transform to modify the price of a line item that has a selling plan (subscription) attached. If you try to run a price test on a product that offers a subscription option, the price change will apply to one-time purchase variants only. Subscription add-to-carts will be charged the original price at checkout regardless of which variant the visitor was assigned to.
        </p>

        <h3 style={S.h3}>Page builder product pages</h3>
        <p style={S.p}>
          Price tests update the displayed price on your product page by targeting specific HTML elements. If your PDP is built with a page builder (e.g. Replo, PageFly, Funnelish), the HTML structure it generates often doesn't match our price selectors, meaning the displayed price won't update even if the checkout price is correct.
        </p>
        <p style={S.p}>
          The fix is the same as for custom themes: add <code style={S.code}>data-spt-price</code> to the price element inside your page builder component. Some builders support custom attributes directly; others require a developer. Contact us if you're unsure.
        </p>

        <h3 style={S.h3}>App-based or JavaScript bundles</h3>
        <p style={S.p}>
          When a customer adds a product to cart, our script attaches a hidden property to the cart line item. Cart Transform reads this property to know which price to apply. If your store uses a bundling app that adds products to the cart via its own JavaScript (rather than through a standard Shopify product form), that property may not get attached, and Cart Transform won't apply the test price.
        </p>
        <p style={S.p}>
          Standard Shopify product forms (the default add-to-cart form on a product page) work correctly. Bundles set up as separate products in Shopify admin also work. The limitation is specific to bundles that bypass the product form entirely.
        </p>

        <div style={S.callout("yellow")}>
          <strong>Not sure if your store is affected?</strong> Email us at <strong>support@arkticstudio.com</strong> before launching a price test and we'll check your setup.
        </div>
      </div>

      <div style={S.divider} />

      {/* FAQ */}
      <div style={S.section} id="faq">
        <h2 style={S.h2}>FAQ</h2>

        <h3 style={S.h3}>Can the same visitor see both variants?</h3>
        <p style={S.p}>No. Visitors are assigned once using a cookie and consistently shown the same variant throughout the experiment.</p>

        <h3 style={S.h3}>Do price experiments work with discount codes?</h3>
        <p style={S.p}>Yes. Cart Transform runs after discount codes are applied, so both can coexist. The test price is applied first, then discounts on top.</p>

        <h3 style={S.h3}>What happens when I stop an experiment?</h3>
        <p style={S.p}>All visitors immediately revert to the control experience. For price experiments, the Cart Transform function stops modifying prices. Existing cart items may retain the test price until they're refreshed.</p>

        <h3 style={S.h3}>Can I run multiple experiments at the same time?</h3>
        <p style={S.p}>Yes, but be careful. If two experiments affect the same page or product, the same visitor may be enrolled in both, which can pollute your results. It's best to run overlapping experiments only when you're confident they don't interact.</p>

        <h3 style={S.h3}>How long should I run an experiment?</h3>
        <p style={S.p}>Long enough to reach statistical significance and cover at least one full business week (to account for day-of-week variation). For most stores, this means 1–4 weeks. Don't stop early just because you see a promising result; early significance often doesn't hold.</p>

        <h3 style={S.h3}>Does the price experiment affect SEO?</h3>
        <p style={S.p}>No. The price change is client-side on the product page and server-side at checkout. Googlebot sees the original product price. Your structured data (JSON-LD) is not modified.</p>

        <h3 style={S.h3}>I need help setting up my theme. What do I do?</h3>
        <p style={S.p}>Contact us and we'll set it up for you at no extra charge. Reach out via the chat widget or email us at <strong>support@arkticstudio.com</strong>.</p>
      </div>
    </div>
  );
}
