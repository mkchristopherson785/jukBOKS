import { storage } from "./storage.js";
import { isVenueWithinSchedule } from "./schedule-utils.js";

function isKioskOffline(venue: any): boolean {
  if (!venue.kioskLockHeartbeat) return true;
  const now = new Date();
  return (now.getTime() - new Date(venue.kioskLockHeartbeat).getTime()) > 90000;
}

const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

async function checkVenueKiosks() {
  try {
    const allVenues = await storage.getAllVenues();

    for (const venue of allVenues) {
      if (!venue.kioskAlertEmail || !venue.kioskScheduleEnabled) continue;

      const withinSchedule = isVenueWithinSchedule(venue);
      const offline = isKioskOffline(venue);

      if (withinSchedule && offline) {
        const lastAlert = venue.kioskLastAlertSentAt ? new Date(venue.kioskLastAlertSentAt).getTime() : 0;
        const now = Date.now();

        if (now - lastAlert > ALERT_COOLDOWN_MS) {
          console.log(`[Kiosk Monitor] ALERT: Venue "${venue.name}" (${venue.code}) kiosk is offline during scheduled hours. Alert email: ${venue.kioskAlertEmail}`);

          await storage.updateVenue(venue.id, {
            kioskLastAlertSentAt: new Date(),
          });
        }
      }
    }
  } catch (error) {
    console.error("[Kiosk Monitor] Error checking venues:", error);
  }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startKioskMonitor() {
  console.log("[Kiosk Monitor] Starting kiosk offline monitoring (checks every 2 minutes)");
  checkVenueKiosks();
  monitorInterval = setInterval(checkVenueKiosks, 2 * 60 * 1000);
}

export function stopKioskMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[Kiosk Monitor] Stopped");
  }
}
