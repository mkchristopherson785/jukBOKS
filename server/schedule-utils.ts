type DaySchedule = { startTime: string; endTime: string };
type DaySchedules = Record<string, DaySchedule>;

const DAY_MAP: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"
};

function getScheduleForDay(venue: any, day: string): DaySchedule {
  const daySchedules = (venue.kioskDaySchedules as DaySchedules) || {};
  if (daySchedules[day]) return daySchedules[day];
  return {
    startTime: venue.kioskStartTime || "12:00",
    endTime: venue.kioskEndTime || "21:00"
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function isVenueWithinSchedule(venue: any): boolean {
  if (!venue.kioskScheduleEnabled) return false;

  const now = new Date();
  const today = DAY_MAP[now.getDay()];
  const yesterday = DAY_MAP[(now.getDay() + 6) % 7];
  const activeDays = (venue.kioskScheduleDays as string[]) || ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (activeDays.includes(today)) {
    const schedule = getScheduleForDay(venue, today);
    const start = toMinutes(schedule.startTime);
    const end = toMinutes(schedule.endTime);
    const isOvernight = end <= start;

    if (isOvernight) {
      if (currentMinutes >= start) return true;
    } else {
      if (currentMinutes >= start && currentMinutes < end) return true;
    }
  }

  if (activeDays.includes(yesterday)) {
    const yesterdaySchedule = getScheduleForDay(venue, yesterday);
    const yStart = toMinutes(yesterdaySchedule.startTime);
    const yEnd = toMinutes(yesterdaySchedule.endTime);
    const isOvernight = yEnd <= yStart;

    if (isOvernight && currentMinutes < yEnd) {
      return true;
    }
  }

  return false;
}
