import { type LoaderFunctionArgs } from "react-router";
import { NavLink, Outlet, useLoaderData, useRouteError } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, headers } = await requireDashboardSession(request);
  return Response.json({ shop }, { headers });
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Experiments", href: "/dashboard/experiments" },
  { label: "Segments", href: "/dashboard/segments" },
  { label: "Settings", href: "/dashboard/settings" },
  { label: "Billing", href: "/dashboard/billing" },
  { label: "Get started", href: "/dashboard/onboarding" },
];

const S = {
  root: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: "#ffffff",
    color: "#111111",
  } as React.CSSProperties,

  sidebar: {
    width: 220,
    borderRight: "1px solid #e9e9e9",
    display: "flex",
    flexDirection: "column" as const,
    flexShrink: 0,
    position: "sticky" as const,
    top: 0,
    height: "100vh",
    overflowY: "auto" as const,
    background: "#ffffff",
  },

  logoArea: {
    padding: "1.25rem 1rem 1rem",
  },

  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.25rem",
  },

  logoMark: {
    width: 24,
    height: 24,
    borderRadius: 4,
    background: "#111111",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: "-0.02em",
    flexShrink: 0,
  } as React.CSSProperties,

  logoText: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#111111",
    letterSpacing: "-0.02em",
  } as React.CSSProperties,

  shopName: {
    fontSize: "0.7rem",
    color: "#999999",
    marginTop: "0.125rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    paddingLeft: "0.125rem",
  },

  nav: {
    flex: 1,
    padding: "0.25rem 0.5rem",
  },

  navDivider: {
    height: 1,
    background: "#e9e9e9",
    margin: "0.5rem 0.5rem",
  },

  footer: {
    padding: "0.75rem 1rem",
    borderTop: "1px solid #e9e9e9",
  },

  footerLink: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.75rem",
    color: "#aaaaaa",
    textDecoration: "none",
  } as React.CSSProperties,

  main: {
    flex: 1,
    minHeight: "100vh",
    overflowX: "hidden" as const,
    background: "#ffffff",
  },
};

function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    display: "block",
    padding: "0.3rem 0.6rem",
    borderRadius: 4,
    fontSize: "0.8125rem",
    fontWeight: isActive ? 500 : 400,
    color: isActive ? "#111111" : "#777777",
    background: isActive ? "#f3f3f3" : "transparent",
    textDecoration: "none",
    marginBottom: "0.0625rem",
  };
}

export default function DashboardLayout() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <div style={S.root}>
      <aside style={S.sidebar}>
        <div style={S.logoArea}>
          <div style={S.logoRow}>
            <div style={S.logoMark}>S</div>
            <span style={S.logoText}>Split Tester</span>
          </div>
          <div style={S.shopName}>{shop}</div>
        </div>

        <nav style={S.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/dashboard"}
              style={navLinkStyle}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={S.footer}>
          <a
            href={`https://${shop}/admin/apps`}
            target="_blank"
            rel="noreferrer"
            style={S.footerLink}
          >
            <span>↗</span>
            <span>Shopify Admin</span>
          </a>
        </div>
      </aside>

      <main style={S.main}>
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div style={{ padding: "3rem", fontFamily: "sans-serif", maxWidth: 600 }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
      <pre style={{ color: "#888", fontSize: "0.8rem", marginTop: "1rem" }}>{String(error)}</pre>
    </div>
  );
}
