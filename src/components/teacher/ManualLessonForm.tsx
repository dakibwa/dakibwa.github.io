"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createBookingFor } from "@/lib/admin-api";
import { formatLongDate, formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
import { SITE_BASE_PATH } from "@/lib/paths";
import "./manual-lesson-form.css";

const empty = {
  email: "",
  name: "",
  lessonType: "single",
  date: "",
  time: "17:00",
  location: "online" as "online" | "porto",
  paymentMode: "card" as "card" | "offline",
};

export function ManualLessonForm({
  token,
  onCreated,
}: {
  token: string;
  onCreated: () => void;
}) {
  const [lesson, setLesson] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  return (
    <details className="teacher-manual">
      <summary>
        <span>
          <span className="teacher-eyebrow">
            For a booking arranged elsewhere
          </span>
          <span className="teacher-manual-title">
            Add a lesson for a student
          </span>
        </span>
        <Plus size={22} aria-hidden="true" />
      </summary>
      <div className="teacher-manual-body">
        <p>
          Students can book through{" "}
          <a href={`${SITE_BASE_PATH}/book/?view=book`}>the booking page</a>.
          Use this if you&rsquo;ve already arranged a lesson another way.
        </p>
        <form
          className="teacher-form teacher-manual-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setStatus("");
            try {
              const result = await createBookingFor(token, {
                email: lesson.email.trim(),
                name: lesson.name.trim(),
                lessonType: lesson.lessonType,
                startAt: portoTimeToUtc(lesson.date, lesson.time),
                location: lesson.location,
                notes: "",
                paymentMode: lesson.paymentMode,
              });
              setLesson(empty);
              if (result.paymentAction === "confirmation_required") {
                const deadline = result.confirmationExpiresAt
                  ? ` The time is held until ${formatLongDate(result.confirmationExpiresAt)} at ${formatSlotTime(result.confirmationExpiresAt)} (Porto time).`
                  : "";
                setStatus(`Lesson reserved. The student has been emailed a link to confirm the lesson and card payment.${deadline}`);
              } else if (result.paymentAction === "scheduled") {
                setStatus("Lesson added. The student has been emailed the details. Their authorised saved card will be charged when the lesson ends.");
              } else {
                setStatus("Lesson added. The student has been emailed the details. Payment is arranged separately.");
              }
              onCreated();
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "This lesson could not be added.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            <span>Student&rsquo;s email</span>
            <input
              type="email"
              required
              disabled={busy}
              value={lesson.email}
              onChange={(e) => setLesson({ ...lesson, email: e.target.value })}
            />
          </label>
          <label>
            <span>Student&rsquo;s name</span>
            <input
              type="text"
              disabled={busy}
              value={lesson.name}
              onChange={(e) => setLesson({ ...lesson, name: e.target.value })}
            />
          </label>
          <label>
            <span>Lesson</span>
            <select
              disabled={busy}
              value={lesson.lessonType}
              onChange={(e) =>
                setLesson({ ...lesson, lessonType: e.target.value })
              }
            >
              <option value="trial">Trial · 60 minutes</option>
              <option value="single">60 minutes</option>
              <option value="long">90 minutes</option>
            </select>
          </label>
          <label>
            <span>Where</span>
            <select
              disabled={busy}
              value={lesson.location}
              onChange={(e) =>
                setLesson({
                  ...lesson,
                  location: e.target.value as "online" | "porto",
                })
              }
            >
              <option value="online">Online</option>
              <option value="porto">In Porto</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <input
              type="date"
              required
              disabled={busy}
              value={lesson.date}
              onChange={(e) => setLesson({ ...lesson, date: e.target.value })}
            />
          </label>
          <label>
            <span>Time in Porto</span>
            <input
              type="time"
              required
              disabled={busy}
              value={lesson.time}
              onChange={(e) => setLesson({ ...lesson, time: e.target.value })}
            />
          </label>
          <div className="teacher-manual-payment">
            <label>
              <span>Payment</span>
              <select
                aria-describedby="manual-payment-help"
                disabled={busy}
                value={lesson.paymentMode}
                onChange={(event) => setLesson({
                  ...lesson,
                  paymentMode: event.target.value as "card" | "offline",
                })}
              >
                <option value="card">Card after the lesson</option>
                <option value="offline">Payment arranged separately</option>
              </select>
            </label>
            <p id="manual-payment-help">
              {lesson.paymentMode === "card"
                ? "If this student has a saved card and has authorised payments for lessons you arrange, it will be charged when the lesson ends. Otherwise, they’ll receive an email link to confirm the lesson and save a card if needed."
                : "The student will receive the lesson details. Arrange payment with them directly; this booking will not charge a card."}
            </p>
          </div>
          <div className="teacher-manual-submit">
            <button
              className="button button--coral"
              type="submit"
              disabled={busy}
            >
              {busy ? "Adding…" : "Add lesson and email student"}
            </button>
          </div>
        </form>
        {error ? (
          <p className="teacher-inline-error" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="teacher-inline-success" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </details>
  );
}
