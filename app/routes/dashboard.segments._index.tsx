import { data, redirect, useFetcher, useLoaderData, useNavigate, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop: shopDomain, setCookie } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  const segments = shop
    ? await prisma.segment.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { experiments: true } } },
      })
    : [];
  return data({ segments }, { headers: { "Set-Cookie": setCookie } });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, setCookie } = await requireDashboardSession(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const segmentId = String(formData.get("segmentId"));

  if (intent === "delete") {
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (shop) {
      await prisma.segment.deleteMany({ where: { id: segmentId, shopId: shop.id } });
    }
  }

  return data({ ok: true }, { headers: { "Set-Cookie": setCookie } });
};

function ruleSummary(rules: unknown): string {
  try {
    const r = rules as { op: string; children: Array<{ field: string; op: string; value: string }> };
    if (!r?.children?.length) return "No conditions";
    const parts = r.children.map((c) => `${c.field} ${c.op === "eq" ? "=" : c.op === "neq" ? "≠" : "~"} ${c.value}`);
    return parts.join(` ${r.op} `);
  } catch {
    return "—";
  }
}

export default function SegmentsIndex() {
  const { segments } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>Segments</h1>
          <p style={{ fontSize: "0.8125rem", color: "#999", margin: "0.25rem 0 0" }}>Target experiments to specific visitor groups.</p>
        </div>
        <button
          onClick={() => navigate("/dashboard/segments/new")}
          style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}
        >
          + New segment
        </button>
      </div>

      {segments.length === 0 ? (
        <div style={{ border: "1px dashed #e9e9e9", borderRadius: 8, padding: "4rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.875rem", color: "#999", margin: "0 0 0.75rem", fontWeight: 500 }}>No segments yet</p>
          <p style={{ fontSize: "0.8125rem", color: "#bbb", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
            Segments let you target experiments to visitors by device, location, UTM source, customer type, and more.
          </p>
          <button
            onClick={() => navigate("/dashboard/segments/new")}
            style={{ fontSize: "0.8125rem", color: "#111", background: "none", border: "1px solid #e9e9e9", borderRadius: 6, padding: "0.4rem 0.875rem", cursor: "pointer" }}
          >
            Create your first segment
          </button>
        </div>
      ) : (
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e9e9e9", background: "#fafafa" }}>
                {["Name", "Conditions", "Experiments", "Created", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.6rem 1rem", fontWeight: 500, color: "#999", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 500, color: "#111" }}>{s.name}</td>
                  <td style={{ padding: "0.85rem 1rem", color: "#777", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ruleSummary(s.rules)}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", color: "#777" }}>{s._count.experiments}</td>
                  <td style={{ padding: "0.85rem 1rem", color: "#aaa" }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="segmentId" value={s.id} />
                      <button
                        type="submit"
                        onClick={(e) => { if (!confirm(`Delete "${s.name}"?`)) e.preventDefault(); }}
                        style={{ fontSize: "0.75rem", color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: "0.2rem 0.4rem" }}
                      >
                        Delete
                      </button>
                    </fetcher.Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
