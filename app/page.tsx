import Home from "@/components/Home";
import { routesSnapshot } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const [snap, { r }] = await Promise.all([routesSnapshot(), searchParams]);
  const start = snap.routes.some((x) => x.id === r) ? r! : snap.active;
  return <Home routes={snap.routes} initialRoute={start} />;
}
