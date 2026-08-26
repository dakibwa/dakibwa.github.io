import { BOOKING_API_BASE_URL } from "@/lib/config";

export type AvailabilityRule = { id: number; weekday: number; start_minute: number; last_start_minute: number };
export type AvailabilityException = { id: number; date: string; kind: "blocked" | "extra"; note: string };
export type AdminBooking = {
  id: string;
  reference: string;
  lesson_name: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled";
  location: "online" | "porto";
  notes: string;
  same_day_change: number;
  reschedule_count: number;
};

async function adminRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BOOKING_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {})
    }
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function fetchSchedule(token: string) {
  return adminRequest<{ rules: AvailabilityRule[]; exceptions: AvailabilityException[] }>(token, "/admin/availability");
}

export function fetchBookings(token: string) {
  return adminRequest<{ bookings: AdminBooking[] }>(token, "/admin/bookings");
}

export function saveRules(token: string, rules: { weekday: number; startMinute: number; lastStartMinute: number }[]) {
  return adminRequest<{ ok: true; count: number }>(token, "/admin/availability", {
    method: "POST",
    body: JSON.stringify({ rules })
  });
}

export function addException(token: string, date: string, note: string) {
  return adminRequest<{ ok: true }>(token, "/admin/exceptions", {
    method: "POST",
    body: JSON.stringify({ date, kind: "blocked", note })
  });
}

export function removeException(token: string, id: number) {
  return adminRequest<{ ok: true }>(token, "/admin/exceptions", {
    method: "POST",
    body: JSON.stringify({ remove: id })
  });
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
