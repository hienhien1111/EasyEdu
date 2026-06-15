const DAY_OFFSETS: Record<string, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

type TimeSlotLike = {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
};

export function getWeekStart(reference = new Date()): Date {
  const day = reference.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(reference);
  monday.setDate(reference.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getWeekEnd(reference = new Date()): Date {
  const end = getWeekStart(reference);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function normalizeDateOnly(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function applyTime(date: Date, time: string): Date {
  const [hour, minute] = time.split(':').map((value) => Number(value));
  const result = new Date(date);
  result.setHours(hour || 0, minute || 0, 0, 0);
  return result;
}

export function getSessionWindow(
  timeSlot: TimeSlotLike,
  weekStart = getWeekStart(),
) {
  const sessionDate = new Date(weekStart);
  sessionDate.setDate(
    weekStart.getDate() + (DAY_OFFSETS[timeSlot.dayOfWeek] ?? 0),
  );
  sessionDate.setHours(0, 0, 0, 0);

  const startAt = applyTime(sessionDate, timeSlot.startTime);
  const endAt = applyTime(sessionDate, timeSlot.endTime);
  if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);

  return { sessionDate, startAt, endAt };
}

export function hasSessionStarted(
  timeSlot: TimeSlotLike,
  weekStart = getWeekStart(),
  now = new Date(),
) {
  return now >= getSessionWindow(timeSlot, weekStart).startAt;
}
