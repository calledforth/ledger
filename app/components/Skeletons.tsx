import { daysInMonth } from "@/lib/time";

const Bar = ({ w, h = 12, r }: { w: string | number; h?: number; r?: number }) => <span className="sk" style={{ width: w, height: h, borderRadius: r }} />;

export function SummarySkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="summary" aria-busy="true" aria-label="Loading summary">
      {Array.from({ length: cards }, (_, i) => (
        <div className="card" key={i}>
          <Bar w={120} h={11} />
          <Bar w={160} h={34} r={8} />
          <Bar w="100%" h={8} r={99} />
          <div style={{ display: "flex", gap: 14 }}>
            <Bar w={110} h={11} />
            <Bar w={100} h={11} />
          </div>
          <Bar w="100%" h={56} r={10} />
          <Bar w="70%" h={11} />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="rows" aria-busy="true" aria-label="Loading charges">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          {i % 3 === 0 && (
            <div className="day">
              <Bar w={80} h={10} />
            </div>
          )}
          <div className="row sk-row">
            <Bar w={36} h={36} r={10} />
            <span className="meta">
              <Bar w={`${45 + ((i * 17) % 30)}%`} h={12} />
              <Bar w={`${25 + ((i * 11) % 20)}%`} h={10} />
            </span>
            <Bar w={64} h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton({ month }: { month: string }) {
  const firstDow = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <div className="cal" aria-busy="true" aria-label="Loading calendar">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div className="dow" key={d}>
          {d}
        </div>
      ))}
      {Array.from({ length: firstDow }, (_, i) => (
        <div className="cell blank" key={`b${i}`} />
      ))}
      {Array.from({ length: daysInMonth(month) }, (_, i) => (
        <div className="cell" key={i}>
          <span className="n">{i + 1}</span>
          <Bar w="60%" h={8} />
        </div>
      ))}
    </div>
  );
}

export function RailSkeleton() {
  return (
    <aside className="panel rail" aria-busy="true" aria-label="Loading upcoming payments">
      <div className="panel-head">
        <Bar w={110} h={16} />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div className="up sk-row" key={i}>
          <Bar w={28} h={30} r={8} />
          <Bar w={36} h={36} r={10} />
          <span className="meta" style={{ display: "grid", gap: 6 }}>
            <Bar w="70%" h={12} />
            <Bar w="40%" h={10} />
          </span>
          <Bar w={48} h={12} />
        </div>
      ))}
    </aside>
  );
}

/** Whole-page skeleton for the first load. */
export function DashboardSkeleton() {
  return (
    <main className="wrap" aria-busy="true">
      <header className="topbar">
        <div className="month">
          <span className="iconbtn" />
          <Bar w={180} h={28} r={8} />
          <span className="iconbtn" />
        </div>
        <div className="top-actions">
          <span className="iconbtn ghost" />
          <span className="iconbtn ghost" />
        </div>
      </header>
      <SummarySkeleton />
      <div className="cols">
        <section className="panel">
          <div className="panel-head">
            <Bar w={110} h={18} />
            <Bar w={170} h={34} r={10} />
          </div>
          <ListSkeleton />
        </section>
        <RailSkeleton />
      </div>
    </main>
  );
}
