const defaultSquareVersion = "2026-05-20";
const maxAvailabilityDays = 31;

const worker = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env), status: 204 });
    }

    const originBlocked = rejectBlockedOrigin(request, env);
    if (originBlocked) return originBlocked;

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "GET" && path === "/health") {
        return jsonResponse(
          {
            environment: env.SQUARE_ENVIRONMENT ?? env.SQUARE_ENV ?? "sandbox",
            missing: missingSquareConfig(env),
            ok: missingSquareConfig(env).length === 0
          },
          200,
          request,
          env
        );
      }

      if (request.method === "GET" && path === "/availability") {
        return searchAvailability(request, env);
      }

      if (request.method === "POST" && (path === "/availability" || path === "/api/booking/availability")) {
        return searchAvailability(request, env, await readJson(request));
      }

      if (request.method === "POST" && (path === "/bookings" || path === "/api/booking/bookings")) {
        return createBooking(request, env, await readJson(request));
      }

      const bookingMatch = path.match(/^\/(?:api\/booking\/)?bookings\/([^/]+)$/);
      if (bookingMatch && request.method === "GET") {
        const booking = await squareRequest(env, `/bookings/${encodeURIComponent(bookingMatch[1])}`);
        return jsonResponse(booking, 200, request, env);
      }

      const cancelMatch = path.match(/^\/(?:api\/booking\/)?bookings\/([^/]+)\/cancel$/);
      if (cancelMatch && request.method === "POST") {
        const body = await readJson(request);
        const cancelled = await squareRequest(env, `/bookings/${encodeURIComponent(cancelMatch[1])}/cancel`, {
          body: JSON.stringify({
            booking_version: body.version,
            idempotency_key: crypto.randomUUID()
          }),
          method: "POST"
        });
        return jsonResponse(cancelled, 200, request, env);
      }

      return jsonResponse({ error: "Not found" }, 404, request, env);
    } catch (error) {
      const message = error instanceof SquareApiError ? error.message : "Booking API request failed.";
      const status = error instanceof SquareApiError ? error.status : 500;
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          status
        })
      );
      return jsonResponse({ error: message }, status, request, env);
    }
  }
};

export default worker;

async function searchAvailability(request, env, body = {}) {
  requireSquareConfig(env);

  const url = new URL(request.url);
  const start = body.startAt ?? body.start ?? url.searchParams.get("start");
  const end = body.endAt ?? body.end ?? url.searchParams.get("end");
  const range = normalizeAvailabilityRange(start, end);
  const teamMemberId = body.teamMemberId ?? url.searchParams.get("teamMemberId") ?? env.SQUARE_TEAM_MEMBER_ID;
  const segmentFilter = {
    service_variation_id: env.SQUARE_SERVICE_VARIATION_ID
  };

  if (teamMemberId) {
    segmentFilter.team_member_id_filter = { any: [teamMemberId] };
  }

  const data = await squareRequest(env, "/bookings/availability/search", {
    body: JSON.stringify({
      query: {
        filter: {
          location_id: env.SQUARE_LOCATION_ID,
          segment_filters: [segmentFilter],
          start_at_range: {
            end_at: range.endAt,
            start_at: range.startAt
          }
        }
      }
    }),
    method: "POST"
  });

  return jsonResponse(
    {
      slots: (data.availabilities ?? []).map((availability) => normalizeSlot(availability, env))
    },
    200,
    request,
    env
  );
}

async function createBooking(request, env, body) {
  requireSquareConfig(env);

  const customer = normalizeCustomer(body.customer ?? {});
  const slot = body.slot ?? {};
  const appointmentSegments = normalizeAppointmentSegments(slot, env);

  if (!slot.startAt) {
    throw new SquareApiError("Choose an available time before booking.", 400);
  }

  const customerId = await ensureCustomer(env, customer);
  const bookingPayload = {
    booking: {
      appointment_segments: appointmentSegments,
      customer_id: customerId,
      customer_note: body.customerNote || undefined,
      location_id: slot.locationId ?? env.SQUARE_LOCATION_ID,
      start_at: slot.startAt
    },
    idempotency_key: crypto.randomUUID()
  };
  const data = await squareRequest(env, "/bookings", {
    body: JSON.stringify(bookingPayload),
    method: "POST"
  });

  return jsonResponse(
    {
      booking: data.booking,
      bookingId: data.booking?.id
    },
    200,
    request,
    env
  );
}

async function ensureCustomer(env, customer) {
  if (customer.email) {
    const found = await squareRequest(env, "/customers/search", {
      body: JSON.stringify({
        limit: 1,
        query: {
          filter: {
            email_address: {
              exact: customer.email
            }
          }
        }
      }),
      method: "POST"
    });
    const existing = found.customers?.[0];
    if (existing?.id && existing.phone_number) return existing.id;
  }

  const created = await squareRequest(env, "/customers", {
    body: JSON.stringify({
      email_address: customer.email,
      family_name: customer.familyName,
      given_name: customer.givenName,
      idempotency_key: crypto.randomUUID(),
      phone_number: customer.phone
    }),
    method: "POST"
  });

  if (!created.customer?.id) {
    throw new SquareApiError("Square did not return a customer ID.", 502);
  }

  return created.customer.id;
}

async function squareRequest(env, path, init = {}) {
  const response = await fetch(`${squareBaseUrl(env)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": env.SQUARE_API_VERSION ?? defaultSquareVersion,
      ...(init.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = data.errors?.[0]?.detail ?? data.errors?.[0]?.code ?? "Square API request failed.";
    throw new SquareApiError(detail, response.status);
  }

  return data;
}

function normalizeSlot(availability, env) {
  const slot = availability.slot ?? availability;
  const segments = (slot.appointment_segments ?? []).map((segment) => ({
    durationMinutes: segment.duration_minutes,
    serviceVariationId: segment.service_variation_id,
    serviceVariationVersion: segment.service_variation_version,
    teamMemberId: segment.team_member_id
  }));
  const firstSegment = segments[0] ?? {};

  return {
    appointmentSegments: segments,
    durationMinutes: firstSegment.durationMinutes,
    endAt: slot.end_at,
    id: `${slot.start_at}-${firstSegment.teamMemberId ?? env.SQUARE_TEAM_MEMBER_ID ?? "team"}`,
    locationId: slot.location_id ?? env.SQUARE_LOCATION_ID,
    serviceVariationId: firstSegment.serviceVariationId ?? env.SQUARE_SERVICE_VARIATION_ID,
    serviceVariationVersion: firstSegment.serviceVariationVersion ?? Number(env.SQUARE_SERVICE_VARIATION_VERSION),
    startAt: slot.start_at,
    teamMemberId: firstSegment.teamMemberId ?? env.SQUARE_TEAM_MEMBER_ID
  };
}

function normalizeAppointmentSegments(slot, env) {
  if (Array.isArray(slot.appointmentSegments) && slot.appointmentSegments.length > 0) {
    return slot.appointmentSegments.map((segment) => validateAppointmentSegment({
      duration_minutes: segment.durationMinutes,
      service_variation_id: segment.serviceVariationId,
      service_variation_version: segment.serviceVariationVersion,
      team_member_id: segment.teamMemberId
    }));
  }

  return [
    validateAppointmentSegment({
      duration_minutes: slot.durationMinutes ? Number(slot.durationMinutes) : undefined,
      service_variation_id: slot.serviceVariationId ?? env.SQUARE_SERVICE_VARIATION_ID,
      service_variation_version: slot.serviceVariationVersion
        ? Number(slot.serviceVariationVersion)
        : env.SQUARE_SERVICE_VARIATION_VERSION
          ? Number(env.SQUARE_SERVICE_VARIATION_VERSION)
          : undefined,
      team_member_id: slot.teamMemberId ?? env.SQUARE_TEAM_MEMBER_ID
    })
  ];
}

function validateAppointmentSegment(segment) {
  const missing = [];
  if (!segment.duration_minutes) missing.push("duration");
  if (!segment.service_variation_id) missing.push("service variation");
  if (!Number.isFinite(segment.service_variation_version)) missing.push("service variation version");
  if (!segment.team_member_id) missing.push("team member");

  if (missing.length) {
    throw new SquareApiError(`Choose a live Square time before booking. Missing ${missing.join(", ")}.`, 400);
  }

  return segment;
}

function normalizeCustomer(customer) {
  const name = String(customer.name ?? "").trim();
  const [givenName = "", ...familyParts] = name.split(/\s+/);
  const normalized = {
    email: String(customer.email ?? "").trim(),
    familyName: familyParts.join(" "),
    givenName,
    phone: String(customer.phone ?? "").trim()
  };

  if (!normalized.givenName || !normalized.email || !normalized.phone) {
    throw new SquareApiError("Name, email, and phone are required for Square booking.", 400);
  }

  return normalized;
}

function normalizeAvailabilityRange(start, end) {
  const startDate = parsePlainDate(start) ?? new Date();
  const endDate = parsePlainDate(end) ?? addDays(startDate, maxAvailabilityDays);
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000);

  if (days < 1 || days > maxAvailabilityDays) {
    throw new SquareApiError("Availability range must be between 1 and 31 days.", 400);
  }

  return {
    endAt: `${toPlainDate(endDate)}T00:00:00Z`,
    startAt: `${toPlainDate(startDate)}T00:00:00Z`
  };
}

function parsePlainDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function toPlainDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function squareBaseUrl(env) {
  const environment = env.SQUARE_ENVIRONMENT ?? env.SQUARE_ENV ?? "sandbox";
  return environment === "production" ? "https://connect.squareup.com/v2" : "https://connect.squareupsandbox.com/v2";
}

function requireSquareConfig(env) {
  const missing = missingSquareConfig(env);
  if (missing.length) {
    throw new SquareApiError(`Square Worker is missing: ${missing.join(", ")}`, 500);
  }
}

function missingSquareConfig(env) {
  return ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID", "SQUARE_SERVICE_VARIATION_ID"].filter((key) => !env[key]);
}

async function readJson(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return {};
  return request.json();
}

function jsonResponse(data, status, request, env) {
  return Response.json(data, {
    headers: corsHeaders(request, env),
    status
  });
}

function corsHeaders(request, env) {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGIN);
  const requestOrigin = request.headers.get("Origin");
  const allowOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] ?? requestOrigin ?? "*";

  return {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": allowOrigin,
    "Cache-Control": "no-store",
    Vary: "Origin"
  };
}

function rejectBlockedOrigin(request, env) {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGIN);
  const requestOrigin = request.headers.get("Origin");

  if (!requestOrigin || allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin)) return null;
  return jsonResponse({ error: "Origin not allowed." }, 403, request, env);
}

function parseAllowedOrigins(value = "") {
  return String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

class SquareApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "SquareApiError";
    this.status = status;
  }
}
