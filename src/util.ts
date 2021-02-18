import { ZonedDateTime } from "@js-joda/core";
import { DateArray } from "ics";

export function to24hour(time12: string): string {
  const [time, period] = time12.split(" ");
  const [hour, minute] = time.split(":");

  let hourInt = parseInt(hour);
  if (period == "PM" && hourInt < 12)
    hourInt += 12;
  else if (period == "AM" && hourInt == 12)
    hourInt = 0;

  return `${String(hourInt).padStart(2, "0")}:${minute}`;
}

// because js is beyond stupid and doesn't have this built in...
export function arrayEquals<T>(xs: readonly T[], ys: readonly T[]): boolean {
  return xs.length === ys.length && xs.every((v, i) => v === ys[i]);
}

export function toDateArray(ldt: ZonedDateTime): DateArray {
  return [ldt.year(), ldt.monthValue(), ldt.dayOfMonth(), ldt.hour(), ldt.minute()];
}
