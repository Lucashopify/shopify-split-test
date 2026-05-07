/**
 * GET /privacy
 * Publicly accessible privacy policy — required for Shopify App Store and Google OAuth verification.
 */
export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 2rem", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "#111", lineHeight: 1.7 }}>
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.5rem" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>A</div>
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "#111", letterSpacing: "-0.02em" }}>Arktic</span>
        </div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.5rem", letterSpacing: "-0.03em" }}>Privacy Policy</h1>
        <p style={{ color: "#777", margin: 0, fontSize: "0.875rem" }}>Last updated: May 2026</p>
      </div>

      <Section title="Overview">
        Arktic ("we", "our", or "the app") is a Shopify app that enables merchants to run A/B experiments on their storefronts. This policy explains what data we collect, how we use it, and your rights regarding that data.
      </Section>

      <Section title="Data we collect">
        <p>We collect the following data to operate the app:</p>
        <ul>
          <li><strong>Merchant data:</strong> Your Shopify shop domain, access token (to call the Shopify Admin API), store currency, timezone, and installation date.</li>
          <li><strong>Storefront visitor data:</strong> Anonymous visitor tokens (first-party cookies), device type, country, UTM parameters, referrer URL, and page URLs. We do not collect names, email addresses, or any personally identifiable information from storefront visitors.</li>
          <li><strong>Order data:</strong> Order IDs, revenue amounts, and currency — matched to visitor tokens via cart attributes to measure experiment revenue impact.</li>
          <li><strong>Event data:</strong> Page views, add-to-cart events, checkout events, and purchase events — linked to anonymous visitor tokens and experiment variants.</li>
        </ul>
      </Section>

      <Section title="How we use data">
        <ul>
          <li>To assign storefront visitors to experiment variants and track their journey</li>
          <li>To compute statistical results (conversion rates, revenue per visitor, p-values) for each experiment</li>
          <li>To display analytics in the merchant dashboard</li>
          <li>To sync experiment configuration to your Shopify storefront via metafields</li>
        </ul>
        We do not sell your data or use it for advertising.
      </Section>

      <Section title="Data storage and security">
        All data is stored in a PostgreSQL database hosted on Railway (EU/US infrastructure). Data is encrypted in transit (TLS) and at rest. Shopify access tokens are stored securely and used only to call the Shopify Admin API on your behalf.
      </Section>

      <Section title="Third-party services">
        <ul>
          <li><strong>Shopify:</strong> We use the Shopify Admin API and Billing API. Shopify's privacy policy applies to data processed through their platform.</li>
          <li><strong>Google Analytics (optional):</strong> If you connect a GA4 property, we store an OAuth refresh token to read analytics data on your behalf. This token is scoped to Google Analytics only. You can disconnect at any time from the Settings page.</li>
          <li><strong>Railway:</strong> Our hosting provider. Processes data according to their privacy policy.</li>
        </ul>
      </Section>

      <Section title="Storefront visitor data">
        Visitor tokens are anonymous — they are randomly generated identifiers stored in first-party cookies. We do not link visitor tokens to personal identities. Visitor data is associated with your shop and used only to compute experiment results for your store. Visitors can clear this data by clearing their browser cookies.
      </Section>

      <Section title="Data retention">
        Experiment data (events, results, visitor records) is retained for the lifetime of your account. When you uninstall the app, your data is retained for 30 days and then permanently deleted, unless you request earlier deletion.
      </Section>

      <Section title="Merchant rights">
        As a merchant, you may:
        <ul>
          <li>Request a copy of all data we hold about your store</li>
          <li>Request deletion of your store's data at any time</li>
          <li>Disconnect third-party integrations (e.g. Google Analytics) from the Settings page</li>
        </ul>
        To exercise these rights, contact us at <a href="mailto:info@arkticstudio.com" style={{ color: "#2563eb" }}>info@arkticstudio.com</a>.
      </Section>

      <Section title="GDPR and data processing">
        For merchants operating in the EU or serving EU customers, we act as a data processor on your behalf. Storefront visitor data is collected under your store's privacy policy and consent mechanisms. We recommend ensuring your store's cookie consent banner covers analytics cookies set by Arktic (<code style={{ background: "#f5f5f5", padding: "0.1rem 0.3rem", borderRadius: 3, fontSize: "0.85em" }}>spt_vid</code>, <code style={{ background: "#f5f5f5", padding: "0.1rem 0.3rem", borderRadius: 3, fontSize: "0.85em" }}>spt_asgn</code>).
      </Section>

      <Section title="Changes to this policy">
        We may update this policy from time to time. Material changes will be communicated via the app dashboard. Continued use of the app after changes constitutes acceptance.
      </Section>

      <Section title="Contact">
        <p style={{ margin: 0 }}>
          For privacy questions or data requests, contact us at{" "}
          <a href="mailto:info@arkticstudio.com" style={{ color: "#2563eb" }}>info@arkticstudio.com</a>.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.625rem", letterSpacing: "-0.01em" }}>{title}</h2>
      <div style={{ fontSize: "0.9rem", color: "#444" }}>{children}</div>
    </section>
  );
}
