import * as SunCalc from "suncalc";

export interface SunInfo {
  sunrise: Date;
  sunset: Date;
  /** civil dusk — when it is genuinely too dark to walk without a headlamp */
  dusk: Date;
  goldenHour: Date;
  minutesToSunset: number;
  minutesToDusk: number;
}

export function sunInfo(lat: number, lng: number, now = new Date()): SunInfo {
  // sun events can be null only in polar latitudes; the Himalaya is not one
  const t = SunCalc.getTimes(now, lat, lng) as Record<string, Date>;
  return {
    sunrise: t.sunrise,
    sunset: t.sunset,
    dusk: t.dusk,
    goldenHour: t.goldenHour,
    minutesToSunset: Math.round((t.sunset.getTime() - now.getTime()) / 60000),
    minutesToDusk: Math.round((t.dusk.getTime() - now.getTime()) / 60000),
  };
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}
