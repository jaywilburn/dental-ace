import { JURISDICTION_GROUPS } from "@/lib/protrack/reference";

/*
  Shared <option> set for any jurisdiction <select>: US states and Canadian
  provinces, grouped under <optgroup>s and name-sorted. No client hooks, so it
  works in both server and client components. Render a placeholder <option>
  before it if the field is optional.
*/
export function JurisdictionOptions() {
  return (
    <>
      {JURISDICTION_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
