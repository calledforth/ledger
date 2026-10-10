import { todayIst } from "@/lib/time";
import { Dashboard } from "./dashboard/Dashboard";
import { isMonth, loadMonth } from "./dashboard/load";

export const dynamic = "force-dynamic";

type Search = { m?: string; view?: string; day?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const month = isMonth(sp.m) ? sp.m : todayIst().slice(0, 7);
  const data = await loadMonth(month);
  const day = sp.view === "cal" && sp.day && /^\d{1,2}$/.test(sp.day) ? Number(sp.day) : null;
  return <Dashboard initial={data} initialView={sp.view === "cal" ? "cal" : "list"} initialDay={day} />;
}
