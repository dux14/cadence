import { localDateKey } from "@/lib/date";

/** True if `due` is a timestamp strictly in the past. */
export function isOverdue(due?: number | null): boolean {
  return typeof due === "number" && due < Date.now();
}

/** "HH:mm" 24h -> "3pm" / "3:30pm" (no space, lowercase, short). */
function shortTime(h: number, m: number): string {
  const hour = h % 12 || 12;
  const mer = h < 12 ? "am" : "pm";
  return m === 0 ? `${hour}${mer}` : `${hour}:${String(m).padStart(2, "0")}${mer}`;
}

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Short relative label for a due date.
 *  - same day:        "hoy 3pm" (with time) / "hoy" (date-only)
 *  - tomorrow:        "mañana 3pm" / "mañana"
 *  - other this year: "jun 12 3pm" / "jun 12"
 */
export function formatDue(
  due: number | null | undefined,
  hasTime: boolean,
  now: Date = new Date(),
): string {
  if (typeof due !== "number") return "";
  const d = new Date(due);
  const dueKey = localDateKey(d);
  const todayKey = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);

  const time = hasTime ? shortTime(d.getHours(), d.getMinutes()) : "";

  let day: string;
  if (dueKey === todayKey) day = "hoy";
  else if (dueKey === tomorrowKey) day = "mañana";
  else day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;

  return time ? `${day} ${time}` : day;
}

/** Split a due timestamp into <input type="date"> + <input type="time"> values. */
export function dueToInputs(
  due: number,
  hasTime: boolean,
): { date: string; time: string } {
  const d = new Date(due);
  const date = localDateKey(d);
  const time = hasTime
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";
  return { date, time };
}

/** Build a due timestamp from date (YYYY-MM-DD) + optional time (HH:mm). */
export function inputsToDue(
  date: string,
  time: string,
): { due: number | null; dueHasTime: boolean } {
  if (!date) return { due: null, dueHasTime: false };
  const [y, mo, d] = date.split("-").map(Number);
  if (time) {
    const [h, mi] = time.split(":").map(Number);
    return { due: new Date(y, mo - 1, d, h, mi, 0, 0).getTime(), dueHasTime: true };
  }
  return { due: new Date(y, mo - 1, d, 0, 0, 0, 0).getTime(), dueHasTime: false };
}
