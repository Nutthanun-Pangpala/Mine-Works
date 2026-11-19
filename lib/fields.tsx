// Small shared form-field helpers for server components.
export function Opt({ list, value, label = "name", empty = "-" }: { list: any[]; value?: any; label?: string | ((x: any) => string); empty?: string | null }) {
  return (
    <>
      {empty !== null && <option value="">{empty}</option>}
      {list.map((x: any) => (
        <option key={x.id} value={x.id}>
          {typeof label === "function" ? label(x) : x[label]}
        </option>
      ))}
    </>
  );
}

export function NameOpt({ list, empty = "กรุณาเลือก" }: { list: any[]; empty?: string | null }) {
  return (
    <>
      {empty !== null && <option value="">{empty}</option>}
      {list.map((x: any) => (
        <option key={x.id} value={x.name}>
          {x.name}
        </option>
      ))}
    </>
  );
}
