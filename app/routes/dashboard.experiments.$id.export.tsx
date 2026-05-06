import { type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const experiment = await prisma.experiment.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { variants: { orderBy: [{ isControl: "desc" }, { createdAt: "asc" }] } },
  });
  if (!experiment) throw new Response("Not found", { status: 404 });

  const [resultRows, liveOrders] = await Promise.all([
    prisma.experimentResult.groupBy({
      by: ["variantId"],
      where: { experimentId: experiment.id },
      _sum: { sessions: true, addToCartCount: true, initiateCheckoutCount: true, conversionCount: true, revenue: true },
      _max: { pValue: true, liftPct: true, srmPValue: true },
    }),
    prisma.order.groupBy({
      by: ["variantId"],
      where: { experimentId: experiment.id },
      _count: { id: true },
      _sum: { revenue: true },
    }),
  ]);

  const rows = experiment.variants.map((v) => {
    const res = resultRows.find((r) => r.variantId === v.id);
    const live = liveOrders.find((o) => o.variantId === v.id);
    const sessions = res?._sum.sessions ?? 0;
    const orders = Math.max(res?._sum.conversionCount ?? 0, live?._count.id ?? 0);
    const revenue = Math.max(res?._sum.revenue ?? 0, live?._sum.revenue ?? 0);
    const atc = res?._sum.addToCartCount ?? 0;
    const checkout = res?._sum.initiateCheckoutCount ?? 0;
    const cvr = sessions > 0 ? (orders / sessions * 100).toFixed(2) : "";
    const atcRate = sessions > 0 ? (atc / sessions * 100).toFixed(2) : "";
    const checkoutRate = sessions > 0 ? (checkout / sessions * 100).toFixed(2) : "";
    const aov = orders > 0 ? (revenue / orders).toFixed(2) : "";
    const rpv = sessions > 0 ? (revenue / sessions).toFixed(2) : "";
    const lift = res?._max.liftPct != null ? (res._max.liftPct * 100).toFixed(2) : "";
    const pValue = res?._max.pValue != null ? res._max.pValue.toFixed(4) : "";
    return [
      v.name,
      v.isControl ? "Yes" : "No",
      sessions,
      orders,
      cvr,
      atcRate,
      checkoutRate,
      revenue.toFixed(2),
      rpv,
      aov,
      v.isControl ? "" : lift,
      v.isControl ? "" : pValue,
    ];
  });

  const headers = [
    "Variant", "Control", "Sessions", "Orders", "CVR (%)",
    "ATC Rate (%)", "Checkout Rate (%)", "Revenue", "Rev/Visitor", "AOV",
    "Lift (%)", "P-Value",
  ];

  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    `# ${experiment.name}`,
    `# Exported: ${new Date().toISOString()}`,
    `# Status: ${experiment.status}`,
    "",
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];

  const filename = `${experiment.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-results.csv`;

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
