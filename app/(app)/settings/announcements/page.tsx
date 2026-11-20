import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";
import { companies } from "@/lib/lookups";
import { Opt } from "@/lib/fields";
import { deleteAnnouncement, saveAnnouncement } from "@/app/actions/settings";
import { fd, todayBkk } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import ConfirmButton from "@/components/ConfirmButton";

export default async function Announcements({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await requirePerm("announcements");
  const kind = sp.kind === "policy" ? "policy" : "news";
  const [rows, cos] = await Promise.all([
    sql()`select a.*, a.publish_at::text as pub, c.name_th as company from announcements a left join companies c on c.id = a.company_id
          where a.kind = ${kind} order by a.publish_at desc, a.id desc`,
    companies(),
  ]);
  const edit = rows.find((r: any) => r.id === Number(sp.edit));
  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: "/settings/announcements", label: "ข่าวสาร", on: kind === "news" },
          { href: "/settings/announcements?kind=policy", label: "นโยบายบริษัท", on: kind === "policy" },
        ]}
      />
      <div className="card">
        {rows.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
        <table className="tbl">
          <tbody>
            {rows.map((a: any) => (
              <tr key={a.id}>
                <td>{fd(a.pub)}</td>
                <td className="wrap">
                  <b>{a.title}</b> {a.pinned ? <span className="badge pending">ปักหมุด</span> : null}
                  <div className="small muted">{a.company || "ทุกบริษัท"}</div>
                </td>
                <td>{a.active ? "เผยแพร่" : "ซ่อน"}</td>
                <td className="actions">
                  <Link className="btn sm" href={`/settings/announcements?kind=${kind}&edit=${a.id}`}>
                    แก้ไข
                  </Link>
                  <form action={deleteAnnouncement}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton message="ลบประกาศนี้?">ลบ</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>{edit ? "แก้ไขประกาศ" : kind === "news" ? "เพิ่มข่าวสาร" : "เพิ่มนโยบาย"}</h2>
        <form action={saveAnnouncement} className="fields" key={edit?.id ?? "new"}>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <input type="hidden" name="kind" value={kind} />
          <label className="full">
            หัวข้อ*
            <input name="title" required defaultValue={edit?.title ?? ""} />
          </label>
          <label className="full">
            เนื้อหา
            <textarea name="body" rows={6} defaultValue={edit?.body ?? ""} />
          </label>
          <label>
            บริษัท
            <select name="company_id" defaultValue={edit?.company_id ?? ""}>
              <Opt list={cos} label="name_th" empty="ทุกบริษัท" />
            </select>
          </label>
          <label>
            วันที่เผยแพร่
            <input type="date" name="publish_at" defaultValue={edit?.pub ?? todayBkk()} />
          </label>
          <label className="check">
            <input type="checkbox" name="pinned" defaultChecked={!!edit?.pinned} /> ปักหมุด
          </label>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} /> เผยแพร่
          </label>
          <button className="btn primary">บันทึก</button>
        </form>
      </div>
    </>
  );
}
