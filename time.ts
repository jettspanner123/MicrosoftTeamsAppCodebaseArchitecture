// Builds a sortable "YYYY-MM-DDTHH:mm" key for the current instant as wall-clock
// time in the given IANA timezone, so it can be string-compared against a
// "YYYY-MM-DDTHH:mm" value typed into an Input.Date + Input.Time pair.
function nowInTimeZoneKey(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function isBeforeNowInTimeZone(dateStr: string, timeStr: string, timeZone: string): boolean {
  return `${dateStr}T${timeStr}` < nowInTimeZoneKey(timeZone);
}
