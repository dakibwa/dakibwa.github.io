"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { formatLongDate } from "@/lib/booking-api";
import { keepDialogFocus } from "@/lib/dialog-focus";

export function CalendarBookingPrompt({ date, onBook, onClose, onViewLessons }: {
  date: string;
  onBook: () => void;
  onClose: () => void;
  onViewLessons?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      aria-labelledby="calendar-booking-title"
      aria-describedby="calendar-booking-date"
      className="policy-dialog calendar-booking-prompt"
      ref={dialogRef}
      onKeyDown={keepDialogFocus}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (
          event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom
        )) onClose();
      }}
    >
      <div className="policy-dialog__heading">
        <h2 id="calendar-booking-title">Do you want to book?</h2>
        <button aria-label="Close booking question" onClick={onClose} type="button">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="calendar-booking-prompt__content">
        <p id="calendar-booking-date">{formatLongDate(`${date}T12:00:00Z`)}</p>
        {onViewLessons ? (
          <button className="text-action" onClick={onViewLessons} type="button">View booked lessons</button>
        ) : null}
        <div className="calendar-booking-prompt__actions">
          <button className="button button--coral" onClick={onBook} type="button">Choose a lesson</button>
          <button className="button button--quiet" onClick={onClose} type="button">Not now</button>
        </div>
      </div>
    </dialog>
  );
}
