const CLS: Record<string, string> = {
  pending: "pending", approved: "approved", rejected: "rejected", cancelled: "", waiting: "",
  probation: "pending", confirmed: "approved", terminated: "rejected",
  draft: "", calculated: "pending", reviewed: "pending", closed: "approved", paid: "approved",
  active: "approved", inactive: "",
};

export default function Badge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${CLS[status] ?? status}`}>{label ?? status}</span>;
}
