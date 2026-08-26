"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, Lock, Mail, UserRound } from "lucide-react";
import { browserTimeZone } from "@/lib/booking-api";
import { login, register, requestPasswordReset, storeSession, type Student } from "@/lib/auth-api";

type Mode = "signin" | "register" | "forgot";

/**
 * Sign in, create an account, or ask for a reset link.
 *
 * Deliberately placed at the end of the booking flow rather than in front of
 * it: a student can see what is free before being asked to make an account,
 * which is the difference between an account being useful and being a toll.
 */
export function AuthPanel({
  initialMode = "signin",
  onSignedIn,
  heading,
  intro
}: {
  initialMode?: Mode;
  onSignedIn: (student: Student) => void;
  heading?: string;
  intro?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function update(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (mode === "forgot") {
        await requestPasswordReset(form.email.trim());
        setNotice("If that email has an account, a reset link is on its way. It works for one hour.");
        return;
      }

      const result =
        mode === "register"
          ? await register({
              name: form.name.trim(),
              email: form.email.trim(),
              password: form.password,
              timezone: browserTimeZone()
            })
          : await login({ email: form.email.trim(), password: form.password });

      storeSession(result.session);
      onSignedIn(result.student);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel">
      {heading ? <h3>{heading}</h3> : null}
      {intro ? <p className="auth-panel__intro">{intro}</p> : null}

      {mode !== "forgot" ? (
        <div className="auth-tabs" role="tablist">
          <button
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "is-active" : ""}
            onClick={() => setMode("signin")}
            role="tab"
            type="button"
          >
            I have an account
          </button>
          <button
            aria-selected={mode === "register"}
            className={mode === "register" ? "is-active" : ""}
            onClick={() => setMode("register")}
            role="tab"
            type="button"
          >
            Create an account
          </button>
        </div>
      ) : null}

      <form onSubmit={submit}>
        {mode === "register" ? (
          <label>
            <span>
              <UserRound size={16} aria-hidden="true" />
              Full name
            </span>
            <input autoComplete="name" onChange={(event) => update({ name: event.target.value })} required value={form.name} />
          </label>
        ) : null}

        <label>
          <span>
            <Mail size={16} aria-hidden="true" />
            Email
          </span>
          <input
            autoComplete="email"
            onChange={(event) => update({ email: event.target.value })}
            required
            type="email"
            value={form.email}
          />
        </label>

        {mode !== "forgot" ? (
          <label>
            <span>
              <Lock size={16} aria-hidden="true" />
              Password
            </span>
            <input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={mode === "register" ? 8 : undefined}
              onChange={(event) => update({ password: event.target.value })}
              required
              type="password"
              value={form.password}
            />
            {mode === "register" ? <small>At least 8 characters. A short phrase works well.</small> : null}
          </label>
        ) : null}

        {error ? (
          <div className="booking-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        {notice ? (
          <div className="booking-alert booking-alert--warn" role="status">
            <p>{notice}</p>
          </div>
        ) : null}

        <button className="button button--coral booking-confirm-button" disabled={busy} type="submit">
          {busy
            ? "Just a moment…"
            : mode === "register"
              ? "Create my account"
              : mode === "forgot"
                ? "Email me a reset link"
                : "Sign in"}
        </button>
      </form>

      <p className="auth-panel__aside">
        {mode === "forgot" ? (
          <button onClick={() => setMode("signin")} type="button">
            Back to signing in
          </button>
        ) : (
          <button onClick={() => setMode("forgot")} type="button">
            I&rsquo;ve forgotten my password
          </button>
        )}
      </p>
    </div>
  );
}
