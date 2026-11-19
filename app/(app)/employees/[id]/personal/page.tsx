import { sql } from "@/lib/db";
import { loadProfile } from "@/lib/profile";
import { options } from "@/lib/lookups";
import { NameOpt } from "@/lib/fields";
import { addSubRecord, deleteSubRecord, updateContact, updatePersonal } from "@/app/actions/employees";
import { GENDER, age, fd, money } from "@/lib/util";
import Notice from "@/components/Notice";
import Tabs from "@/components/Tabs";
import ConfirmButton from "@/components/ConfirmButton";

export default async function Personal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { e, canPersonal, self } = await loadProfile(id);
  const tab = ["contact", "experience", "education", "family"].includes(sp.tab) ? sp.tab : "personal";
  const edit = canPersonal && sp.edit === "1";
  const base = `/employees/${e.id}/personal`;
  const [titles, nat, rel, marital, military, blood, levels, rels, occ, exp, edu, fam, emer] = await Promise.all([
    options("title"), options("nationality"), options("religion"), options("marital"), options("military"), options("blood"),
    options("education_level"), options("relationship"), options("occupation"),
    sql()`select *, date_from::text as df, date_to::text as dt from employee_experiences where employee_id = ${e.id} order by date_from desc nulls last`,
    sql()`select * from employee_educations where employee_id = ${e.id} order by year_to desc nulls last`,
    sql()`select *, birth_date::text as bd from employee_families where employee_id = ${e.id} order by id`,
    sql()`select * from emergency_contacts where employee_id = ${e.id} order by id`,
  ]);
  const del = (kind: string, rid: number) =>
    canPersonal && (
      <form action={deleteSubRecord}>
        <input type="hidden" name="id" value={e.id} />
        <input type="hidden" name="rid" value={rid} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="back" value={`${base}?tab=${tab}`} />
        <ConfirmButton message="ลบรายการนี้?">ลบ</ConfirmButton>
      </form>
    );
  const show = (v: any) => (v === null || v === undefined || v === "" ? "–" : v);

  return (
    <>
      <Notice sp={sp} />
      <Tabs
        small
        tabs={[
          { href: base, label: "ข้อมูลส่วนตัว", on: tab === "personal" },
          { href: `${base}?tab=contact`, label: "ข้อมูลติดต่อ", on: tab === "contact" },
          { href: `${base}?tab=experience`, label: "ประสบการณ์ทำงาน", on: tab === "experience" },
          { href: `${base}?tab=education`, label: "การศึกษา", on: tab === "education" },
          { href: `${base}?tab=family`, label: "ครอบครัว", on: tab === "family" },
        ]}
      />

      {tab === "personal" && !edit && (
        <div className="card">
          <div className="row">
            <h2>
              {e.title || ""} {e.first_name} {e.last_name} {e.nickname ? `(${e.nickname})` : ""}
            </h2>
            <span className="spacer" />
            {canPersonal && (
              <a className="btn sm" href={`${base}?edit=1`}>
                แก้ไข
              </a>
            )}
          </div>
          <div className="muted" style={{ marginTop: -8, marginBottom: 10 }}>
            {[e.first_name_en, e.last_name_en].filter(Boolean).join(" ")} {e.nickname_en ? `(${e.nickname_en})` : ""} ·{" "}
            {e.person_type === "foreign" ? "ชาวต่างชาติ" : "คนไทย"}
          </div>
          <dl className="info">
            <dt>วันเกิด</dt>
            <dd>{e.bd ? `${fd(e.bd)} (${age(e.bd)} ปี)` : "–"}</dd>
            <dt>เพศ</dt>
            <dd>{GENDER[e.gender] || "–"}</dd>
            <dt>เลขบัตรประชาชน</dt>
            <dd>{self || canPersonal ? show(e.national_id) : e.national_id ? `xxxxxxxxx${String(e.national_id).slice(-4)}` : "–"}</dd>
            <dt>เลขที่หนังสือเดินทาง</dt>
            <dd>{show(e.passport_no)}</dd>
            {e.person_type === "foreign" && (
              <>
                <dt>ใบอนุญาตทำงาน</dt>
                <dd>
                  {show(e.work_permit_no)} {e.work_permit_expiry ? `หมดอายุ ${fd(String(e.work_permit_expiry).slice(0, 10))}` : ""}
                </dd>
              </>
            )}
            <dt>เชื้อชาติ / สัญชาติ</dt>
            <dd>
              {show(e.race)} / {show(e.nationality)}
            </dd>
            <dt>ศาสนา</dt>
            <dd>{show(e.religion)}</dd>
            <dt>สถานภาพสมรส</dt>
            <dd>{show(e.marital_status)}</dd>
            <dt>สถานภาพเกณฑ์ทหาร</dt>
            <dd>{show(e.military_status)}</dd>
            <dt>หมู่เลือด</dt>
            <dd>{show(e.blood_type)}</dd>
            <dt>น้ำหนัก / ส่วนสูง</dt>
            <dd>
              {show(e.weight)} กก. / {show(e.height)} ซม.
            </dd>
            <dt>หมายเหตุ</dt>
            <dd>{show(e.note)}</dd>
          </dl>
        </div>
      )}

      {tab === "personal" && edit && (
        <div className="card">
          <h2>แก้ไขข้อมูลส่วนตัว</h2>
          <form action={updatePersonal} className="fields">
            <input type="hidden" name="id" value={e.id} />
            <label>
              ประเภท*
              <select name="person_type" defaultValue={e.person_type}>
                <option value="thai">คนไทย</option>
                <option value="foreign">ชาวต่างชาติ</option>
              </select>
            </label>
            <label>
              คำนำหน้า
              <select name="title" defaultValue={e.title ?? ""}>
                <NameOpt list={titles} />
              </select>
            </label>
            <label>
              ชื่อ (TH)*
              <input name="first_name" required defaultValue={e.first_name} />
            </label>
            <label>
              นามสกุล (TH)*
              <input name="last_name" required defaultValue={e.last_name} />
            </label>
            <label>
              ชื่อ (EN)
              <input name="first_name_en" defaultValue={e.first_name_en ?? ""} />
            </label>
            <label>
              นามสกุล (EN)
              <input name="last_name_en" defaultValue={e.last_name_en ?? ""} />
            </label>
            <label>
              ชื่อเล่น
              <input name="nickname" defaultValue={e.nickname ?? ""} />
            </label>
            <label>
              ชื่อเล่น (EN)
              <input name="nickname_en" defaultValue={e.nickname_en ?? ""} />
            </label>
            <label>
              วันเกิด
              <input type="date" name="birth_date" defaultValue={e.bd ?? ""} />
            </label>
            <label>
              เพศ
              <select name="gender" defaultValue={e.gender ?? ""}>
                <option value="">-</option>
                <option value="male">ชาย</option>
                <option value="female">หญิง</option>
                <option value="other">อื่นๆ</option>
              </select>
            </label>
            <label>
              เลขบัตรประชาชน
              <input name="national_id" defaultValue={e.national_id ?? ""} maxLength={13} />
            </label>
            <label>
              เลขที่หนังสือเดินทาง
              <input name="passport_no" defaultValue={e.passport_no ?? ""} />
            </label>
            <label>
              เลขใบอนุญาตทำงาน
              <input name="work_permit_no" defaultValue={e.work_permit_no ?? ""} />
            </label>
            <label>
              วันหมดอายุใบอนุญาตทำงาน
              <input type="date" name="work_permit_expiry" defaultValue={e.work_permit_expiry ? String(e.work_permit_expiry).slice(0, 10) : ""} />
            </label>
            <label>
              เชื้อชาติ
              <input name="race" defaultValue={e.race ?? ""} />
            </label>
            <label>
              สัญชาติ
              <select name="nationality" defaultValue={e.nationality ?? ""}>
                <NameOpt list={nat} />
              </select>
            </label>
            <label>
              ศาสนา
              <select name="religion" defaultValue={e.religion ?? ""}>
                <NameOpt list={rel} />
              </select>
            </label>
            <label>
              สถานภาพสมรส
              <select name="marital_status" defaultValue={e.marital_status ?? ""}>
                <NameOpt list={marital} />
              </select>
            </label>
            <label>
              สถานภาพเกณฑ์ทหาร
              <select name="military_status" defaultValue={e.military_status ?? ""}>
                <NameOpt list={military} />
              </select>
            </label>
            <label>
              หมู่เลือด
              <select name="blood_type" defaultValue={e.blood_type ?? ""}>
                <NameOpt list={blood} />
              </select>
            </label>
            <label>
              น้ำหนัก (กก.)
              <input type="number" step="0.1" name="weight" defaultValue={e.weight ?? ""} />
            </label>
            <label>
              ส่วนสูง (ซม.)
              <input type="number" step="0.1" name="height" defaultValue={e.height ?? ""} />
            </label>
            <label className="full">
              หมายเหตุ
              <textarea name="note" rows={2} defaultValue={e.note ?? ""} />
            </label>
            <label className="full">
              รูปสำหรับใช้ตรวจสอบสแกนใบหน้า / รูปโปรไฟล์
              <input type="file" name="photo" accept="image/*" />
            </label>
            <div className="row full">
              <button className="btn primary">บันทึก</button>
              <a className="btn" href={base}>
                ยกเลิก
              </a>
            </div>
          </form>
        </div>
      )}

      {tab === "contact" && (
        <div className="card">
          <h2>ข้อมูลติดต่อ</h2>
          <form action={updateContact} className="fields">
            <input type="hidden" name="id" value={e.id} />
            <label>
              อีเมลบริษัท (ชื่อผู้ใช้งาน)
              <input type="email" name="work_email" defaultValue={e.work_email ?? ""} disabled={!canPersonal} />
            </label>
            <label>
              เบอร์ที่ทำงาน
              <input name="work_phone" defaultValue={e.work_phone ?? ""} disabled={!canPersonal} />
            </label>
            <label>
              อีเมลส่วนตัว
              <input type="email" name="personal_email" defaultValue={e.personal_email ?? ""} disabled={!canPersonal} />
            </label>
            <label>
              เบอร์มือถือ
              <input name="mobile" defaultValue={e.mobile ?? ""} disabled={!canPersonal} />
            </label>
            <label>
              ไลน์ไอดี
              <input name="line_id" defaultValue={e.line_id ?? ""} disabled={!canPersonal} />
            </label>
            <label className="full">
              ที่อยู่ตามทะเบียนบ้าน
              <textarea name="address_registered" rows={2} defaultValue={e.address_registered ?? ""} disabled={!canPersonal} />
            </label>
            <label className="full">
              ที่อยู่ปัจจุบัน
              <textarea name="address_current" rows={2} defaultValue={e.address_current ?? ""} disabled={!canPersonal} />
            </label>
            {canPersonal && <button className="btn primary">บันทึก</button>}
          </form>
          <h2 style={{ marginTop: 18 }}>ผู้ติดต่อกรณีฉุกเฉิน</h2>
          <table className="tbl compact">
            <tbody>
              {emer.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.relationship}</td>
                  <td>{c.phone}</td>
                  <td>{del("emergency", c.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canPersonal && (
            <form action={addSubRecord} className="inline" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="kind" value="emergency" />
              <input type="hidden" name="back" value={`${base}?tab=contact`} />
              <input name="name" placeholder="ชื่อ - นามสกุล" required />
              <select name="relationship">
                <NameOpt list={rels} empty="ความสัมพันธ์" />
              </select>
              <input name="phone" placeholder="เบอร์โทร" />
              <button className="btn">เพิ่ม</button>
            </form>
          )}
        </div>
      )}

      {tab === "experience" && (
        <div className="card">
          <h2>ข้อมูลประสบการณ์ทำงาน</h2>
          {exp.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
          <table className="tbl compact">
            <tbody>
              {exp.map((x: any) => (
                <tr key={x.id}>
                  <td>
                    <b>{x.company}</b>
                    <div className="small muted">{x.position}</div>
                  </td>
                  <td>
                    {fd(x.df)} – {fd(x.dt)}
                  </td>
                  <td>{x.last_salary ? money(x.last_salary) : ""}</td>
                  <td className="wrap">{x.responsibilities}</td>
                  <td>{del("experience", x.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canPersonal && (
            <form action={addSubRecord} className="fields" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="kind" value="experience" />
              <input type="hidden" name="back" value={`${base}?tab=experience`} />
              <label>
                ชื่อบริษัท*
                <input name="company" required />
              </label>
              <label>
                ตำแหน่งสุดท้าย*
                <input name="position" required />
              </label>
              <label>
                เงินเดือนล่าสุด
                <input type="number" name="last_salary" />
              </label>
              <label>
                ตั้งแต่
                <input type="date" name="date_from" />
              </label>
              <label>
                ถึง
                <input type="date" name="date_to" />
              </label>
              <label className="full">
                หน้าที่ความรับผิดชอบ
                <textarea name="responsibilities" rows={2} />
              </label>
              <button className="btn">เพิ่มข้อมูล</button>
            </form>
          )}
        </div>
      )}

      {tab === "education" && (
        <div className="card">
          <h2>ข้อมูลการศึกษา</h2>
          {edu.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
          <table className="tbl compact">
            <tbody>
              {edu.map((x: any) => (
                <tr key={x.id}>
                  <td>
                    <b>{x.institution}</b>
                    <div className="small muted">
                      {x.level} {x.faculty ? `· ${x.faculty}` : ""} {x.major ? `· ${x.major}` : ""}
                    </div>
                  </td>
                  <td>
                    {x.year_from || ""} – {x.year_to || ""}
                  </td>
                  <td>{x.gpa ? `GPA ${x.gpa}` : ""}</td>
                  <td>{del("education", x.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canPersonal && (
            <form action={addSubRecord} className="fields" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="kind" value="education" />
              <input type="hidden" name="back" value={`${base}?tab=education`} />
              <label>
                สถานศึกษา*
                <input name="institution" required />
              </label>
              <label>
                ระดับการศึกษา*
                <select name="level" required>
                  <NameOpt list={levels} />
                </select>
              </label>
              <label>
                จบการศึกษาจาก (ประเทศ)
                <input name="country" defaultValue="ไทย" />
              </label>
              <label>
                คณะ
                <input name="faculty" />
              </label>
              <label>
                วิชาเอก
                <input name="major" />
              </label>
              <label>
                ปีที่เริ่ม (พ.ศ./ค.ศ.)
                <input type="number" name="year_from" />
              </label>
              <label>
                ปีที่จบ
                <input type="number" name="year_to" />
              </label>
              <label>
                เกรดเฉลี่ย
                <input type="number" step="0.01" name="gpa" />
              </label>
              <button className="btn">เพิ่มข้อมูล</button>
            </form>
          )}
        </div>
      )}

      {tab === "family" && (
        <div className="card">
          <h2>ข้อมูลครอบครัว</h2>
          {fam.length === 0 ? <div className="empty">ไม่มีข้อมูล</div> : null}
          <table className="tbl compact">
            <tbody>
              {fam.map((x: any) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.relationship}</td>
                  <td>{x.bd ? `${fd(x.bd)} (${age(x.bd)} ปี)` : ""}</td>
                  <td>{x.occupation}</td>
                  <td>{x.phone}</td>
                  <td>{del("family", x.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canPersonal && (
            <form action={addSubRecord} className="fields" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="kind" value="family" />
              <input type="hidden" name="back" value={`${base}?tab=family`} />
              <label>
                ชื่อ - นามสกุล*
                <input name="name" required />
              </label>
              <label>
                ความสัมพันธ์*
                <select name="relationship" required>
                  <NameOpt list={rels} />
                </select>
              </label>
              <label>
                วันเกิด
                <input type="date" name="birth_date" />
              </label>
              <label>
                อาชีพ
                <select name="occupation">
                  <NameOpt list={occ} />
                </select>
              </label>
              <label>
                เบอร์ที่ทำงาน
                <input name="phone" />
              </label>
              <button className="btn">เพิ่ม</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
