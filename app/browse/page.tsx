import Browser from "@/components/Browser";
import { routesSnapshot } from "@/lib/routes";
import { normRel } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string; path?: string; file?: string }> }) {
  const [snap, q] = await Promise.all([routesSnapshot(), searchParams]);
  const { r } = q;
  const path = q.path != null ? normRel(q.path) : undefined;
  const file = q.file != null ? normRel(q.file) : undefined;
  const start = snap.routes.some((x) => x.id === r) ? r! : snap.active;
  const fromLink = start === r && path != null;
  return (
    <Browser
      key={`${start}|${fromLink ? path : ""}|${fromLink ? file ?? "" : ""}`}
      routes={snap.routes}
      initialRoute={start}
      initialPath={fromLink ? path : null}
      initialFile={fromLink ? file ?? null : null}
    />
  );
}
