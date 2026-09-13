import { BookingApiError } from "@/lib/booking-api";
import { BOOKING_API_BASE_URL } from "@/lib/config";

export type ManualLessonInvitation = {
  booking: {
    reference: string;
    status: "pending_payment" | "confirmed" | "cancelled";
    lessonType: {
      id: string;
      name: string;
      durationMinutes: number;
      priceCents: number;
    };
    startAt: string;
    endAt: string;
    location: "online" | "porto";
  };
  expiresAt: string;
  hasSavedCard: boolean;
  paymentState: "awaiting_confirmation" | "setting_up_card" | "confirmed" | "cancelled";
  teacherPaymentsAuthorised: boolean;
  /** The first acceptance freezes this choice for safe checkout retries. */
  acceptedTeacherPayments: boolean | null;
  manageUrl?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BOOKING_API_BASE_URL) {
    throw new BookingApiError("The booking system is not connected. Please try again later.", 503);
  }

  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new BookingApiError("We couldn’t reach the booking system. Please check your connection and try again.", 0);
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new BookingApiError(data.error || "Something went wrong. Please try again.", response.status);
  }
  return data;
}

export function fetchManualLessonInvitation(token: string, signal?: AbortSignal) {
  return request<ManualLessonInvitation>(`/booking-invitations/${encodeURIComponent(token)}`, { signal });
}

export function confirmManualLessonInvitation(
  token: string,
  input: { paymentConsent: true; allowTeacherPayments: boolean },
) {
  return request<ManualLessonInvitation & { checkoutUrl?: string }>(
    `/booking-invitations/${encodeURIComponent(token)}`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function declineManualLessonInvitation(token: string) {
  return request<ManualLessonInvitation>(
    `/booking-invitations/${encodeURIComponent(token)}/decline`,
    { method: "POST", body: "{}" },
  );
}

export function fetchTeacherPayments(session: string) {
  return request<{ enabled: boolean }>("/me/teacher-payments", {
    headers: { Authorization: `Bearer ${session}` },
  });
}

export function revokeTeacherPayments(session: string) {
  return request<{ enabled: boolean }>("/me/teacher-payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${session}` },
    body: JSON.stringify({ enabled: false }),
  });
}
