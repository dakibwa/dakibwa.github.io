"use client";

import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import {
  connectGoogleMeet,
  fetchGoogleMeetConnection,
  type GoogleMeetConnection,
} from "@/lib/admin-api";

export function TeacherMeetConnection({ token }: { token: string }) {
  const [connection, setConnection] = useState<GoogleMeetConnection | null>(null);
  const [error, setError] = useState("");
  const [callbackResult, setCallbackResult] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("meet");
    if (result && ["connected", "cancelled", "error"].includes(result)) {
      setCallbackResult(result);
      url.searchParams.delete("meet");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    fetchGoogleMeetConnection(token)
      .then(result => { if (active) setConnection(result); })
      .catch(caught => {
        if (active) setError(caught instanceof Error ? caught.message : "Google Meet status could not be loaded.");
      });
    return () => { active = false; };
  }, [token, attempt]);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError("");
    setCallbackResult("");
    try {
      const result = await connectGoogleMeet(token);
      const url = new URL(result.url);
      if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password) {
        throw new Error("The Google connection could not be opened. Please try again.");
      }
      window.location.assign(url.href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Google connection could not be opened. Please try again.");
      setBusy(false);
    }
  }

  const feedback = callbackResult === "connected"
    ? !connection
      ? "Checking your Google Meet connection…"
      : connection.connected && !connection.needsReconnect
        ? "Google Meet connected. Online lesson links will now be created automatically."
        : "Google Meet is not connected yet. Please try again."
    : callbackResult === "cancelled"
      ? "Google Meet connection was cancelled. You can try again when you’re ready."
      : callbackResult === "error"
        ? "Google Meet could not be connected. Please try again."
        : "";

  return (
    <section className="teacher-meet" aria-labelledby="teacher-meet-title">
      <div className="teacher-meet-copy">
        <h2 id="teacher-meet-title"><Video size={18} aria-hidden="true" /> Google Meet</h2>
        {connection ? (
          <p>
            {!connection.configured
              ? "Google Meet needs a one-time setup before it can create lesson links."
              : connection.needsReconnect
                ? "Reconnect your Google account to keep creating online lesson links."
                : connection.connected
                  ? `Connected${connection.email ? ` as ${connection.email}` : ""}. Online lesson links are created automatically.`
                  : "Connect your Google account to create a Meet link for each online lesson."}
          </p>
        ) : !error && !feedback ? <p role="status">Checking Google Meet…</p> : null}
        {connection && connection.pending > 0 ? (
          <p>{connection.pending} online {connection.pending === 1 ? "lesson is" : "lessons are"} waiting for a Meet link.</p>
        ) : null}
        {feedback ? <p role="status">{feedback}</p> : null}
        {error ? <p className="teacher-meet-error" role="alert">{error}</p> : null}
      </div>
      {connection?.configured && (!connection.connected || connection.needsReconnect) ? (
        <button className="button button--coral" disabled={busy} onClick={() => void connect()} type="button">
          {busy ? "Opening Google…" : connection.needsReconnect ? "Reconnect Google Meet" : "Connect Google Meet"}
        </button>
      ) : !connection && error ? (
        <button className="teacher-text-button" onClick={() => setAttempt(value => value + 1)} type="button">Retry Google Meet status</button>
      ) : null}
    </section>
  );
}
