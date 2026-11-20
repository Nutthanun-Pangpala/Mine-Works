import TeamTabs from "./TeamTabs";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="head">
        <h1>ทีม</h1>
      </div>
      <TeamTabs />
      {children}
    </>
  );
}
