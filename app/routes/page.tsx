import RoutesManager from "@/components/RoutesManager";
import { routesSnapshot } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <RoutesManager initial={await routesSnapshot()} />;
}
