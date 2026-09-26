/**
 * Health Connect access, for sleep as context.
 *
 * Read-only and read on demand. Health data is deliberately NEVER copied into this
 * app's database, which means it never lands in a backup file either — the export
 * is something people are encouraged to email themselves, and sleep history has no
 * business travelling in it. The cost is a query per Stats load, which is fine.
 *
 * Every function degrades quietly: Health Connect is absent on many devices, and
 * missing context should never break the screen showing it.
 */

import { Platform } from "react-native";
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from "react-native-health-connect";

import { sleepHoursByWakeDate } from "./utils/sleepInsight";

const SLEEP_PERMISSION = { accessType: "read", recordType: "SleepSession" } as const;

export type HealthAvailability = "available" | "needsUpdate" | "unavailable";

export async function getHealthAvailability(): Promise<HealthAvailability> {
  if (Platform.OS !== "android") return "unavailable";
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return "available";
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return "needsUpdate";
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function hasSleepPermission(): Promise<boolean> {
  try {
    if ((await getHealthAvailability()) !== "available") return false;
    if (!(await initialize())) return false;
    const granted = await getGrantedPermissions();
    return granted.some(
      (permission) =>
        "recordType" in permission &&
        permission.recordType === "SleepSession" &&
        permission.accessType === "read"
    );
  } catch {
    return false;
  }
}

/** Prompts for sleep read access. Returns whether it ended up granted. */
export async function requestSleepPermission(): Promise<boolean> {
  try {
    if ((await getHealthAvailability()) !== "available") return false;
    if (!(await initialize())) return false;
    await requestPermission([SLEEP_PERMISSION]);
    return await hasSleepPermission();
  } catch {
    return false;
  }
}

/**
 * Hours slept per wake-up date across a local date range.
 *
 * The query window starts a day early: last night's session begins on the previous
 * calendar day, and asking only from `from` onwards would drop the first night.
 */
export async function readSleepHours(
  fromDate: string,
  toDate: string
): Promise<Record<string, number>> {
  try {
    if (!(await hasSleepPermission())) return {};

    const start = new Date(`${fromDate}T00:00:00`);
    start.setDate(start.getDate() - 1);
    const end = new Date(`${toDate}T23:59:59`);

    const result = await readRecords("SleepSession", {
      timeRangeFilter: {
        operator: "between",
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    return sleepHoursByWakeDate(result.records);
  } catch (err) {
    console.warn("Sleep read failed:", err);
    return {};
  }
}
