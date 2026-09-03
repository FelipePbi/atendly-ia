import { z } from "zod";

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z.string().refine(isIanaTimezone, {
  message: "Invalid IANA timezone"
});

export type Timezone = z.infer<typeof timezoneSchema>;
