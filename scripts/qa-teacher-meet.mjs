import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Teacher account, API and Google authorization destination are all isolated fixtures.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const browser = await chromium.launch({ headless: true });
const disconnected = { configured: true, connected: false, email: null, needsReconnect: false, pending: 2 };
const teacher = { id: "teacher", name: "Inês", email: "teacher@example.invalid", role: "teacher", timezone: "Europe/Lisbon", phone: "" };
const authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?fixture=meet";
await mkdir("tmp/qa/meet", { recursive: true });

async function fixture(width, connection, { callback = "", failStatus = false, connectResult = { url: authorizationUrl } } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const calls = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-meet-teacher"));
  await page.route("https://accounts.google.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated Google authorization</title><p>Authorization fixture only</p>" }));
  await page.route("**/ines-booking*/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/me") return route.fulfill({ json: { student: teacher, bookings: [], series: [] } });
    if (path === "/admin/availability") return route.fulfill({ json: { rules: [], exceptions: [] } });
    if (path === "/admin/bookings") return route.fulfill({ json: { bookings: [] } });
    if (path === "/admin/google-calendar") {
      assert.equal(request.headers().authorization, "Bearer isolated-meet-teacher");
      if (failStatus) { return route.fulfill({ status: 503, json: { error: "Meet status is temporarily unavailable." } }); }
      return route.fulfill({ json: connection });
    }
    if (path === "/admin/google-calendar/connect") {
      assert.equal(request.method(), "POST");
      assert.equal(request.headers().authorization, "Bearer isolated-meet-teacher");
      calls.push(path);
      return route.fulfill({ json: connectResult });
    }
    errors.push(`Unexpected fixture request: ${path}`);
    return route.abort();
  });
  await page.goto(`${base}/schedule/${callback}`);
  await page.locator(".teacher-meet").waitFor();
  return { page, panel: page.locator(".teacher-meet"), calls, errors, recoverStatus: () => { failStatus = false; } };
}

try {
  for (const width of [1280, 390]) {
    const setup = await fixture(width, { ...disconnected, configured: false, pending: 0 });
    await expect(setup.panel).toContainText("one-time setup");
    await expect(setup.panel.getByRole("button")).toHaveCount(0);
    assert.deepEqual(setup.calls, []);
    await setup.page.close();

    const ready = await fixture(width, disconnected);
    await expect(ready.panel).toContainText("2 lessons are waiting to sync.");
    await expect(ready.panel.getByRole("button", { name: "Connect Google Meet", exact: true })).toBeVisible();
    assert.deepEqual(ready.calls, [], "OAuth never starts without a click");
    assert.ok(await ready.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ready.panel.screenshot({ path: `tmp/qa/meet/connection-${width}.png` });
    await ready.panel.getByRole("button", { name: "Connect Google Meet", exact: true }).click();
    await ready.page.waitForURL(authorizationUrl);
    await expect(ready.page.getByText("Authorization fixture only")).toBeVisible();
    assert.equal(ready.calls.length, 1);
    assert.deepEqual(ready.errors, []);
    await ready.page.close();

    const connected = await fixture(width, { ...disconnected, connected: true, email: "teacher@example.invalid", pending: 0 }, { callback: "?meet=connected&view=lessons#retained" });
    await expect(connected.panel).toContainText("Connected as teacher@example.invalid");
    await expect(connected.panel.getByRole("status")).toHaveText(/Google Calendar connected/);
    assert.equal(new URL(connected.page.url()).search, "?view=lessons");
    assert.equal(new URL(connected.page.url()).hash, "#retained");
    await expect(connected.panel.getByRole("button")).toHaveCount(0);
    await expect(connected.panel.getByRole("link", { name: "Open Google Calendar", exact: true })).toHaveAttribute("href", "https://calendar.google.com/");
    await expect(connected.panel).toContainText("See event details");
    await connected.page.close();
  }

  const reconnect = await fixture(1280, { ...disconnected, connected: true, needsReconnect: true }, { callback: "?meet=error&retained=1" });
  await expect(reconnect.panel.getByRole("button", { name: "Reconnect Google Meet", exact: true })).toBeVisible();
  await expect(reconnect.panel.getByRole("status")).toHaveText(/could not be connected/);
  assert.equal(new URL(reconnect.page.url()).search, "?retained=1");
  await reconnect.page.close();

  const cancelled = await fixture(1280, disconnected, { callback: "?meet=cancelled" });
  await expect(cancelled.panel.getByRole("status")).toHaveText(/connection was cancelled/);
  assert.deepEqual(cancelled.calls, []);
  await cancelled.page.close();

  const unverified = await fixture(1280, disconnected, { callback: "?meet=connected" });
  await expect(unverified.panel.getByRole("status")).toHaveText("Google Meet is not connected yet. Please try again.");
  await unverified.page.close();

  const failed = await fixture(1280, disconnected, { failStatus: true });
  await expect(failed.panel.getByRole("alert")).toContainText("temporarily unavailable");
  failed.recoverStatus();
  await failed.panel.getByRole("button", { name: "Retry Google Meet status" }).click();
  await expect(failed.panel.getByRole("button", { name: "Connect Google Meet", exact: true })).toBeVisible();
  await failed.page.close();

  for (const url of ["https://accounts.google.com.example.invalid/o/oauth2/v2/auth", "https://accounts.google.com/other", "http://accounts.google.com/o/oauth2/v2/auth"]) {
    const unsafe = await fixture(1280, disconnected, { connectResult: { url } });
    await unsafe.panel.getByRole("button", { name: "Connect Google Meet", exact: true }).click();
    await expect(unsafe.panel.getByRole("alert")).toContainText("could not be opened");
    assert.equal(new URL(unsafe.page.url()).origin, new URL(base).origin);
    await expect(unsafe.panel.getByRole("button", { name: "Connect Google Meet", exact: true })).toBeEnabled();
    await unsafe.page.close();
  }
  console.log("Teacher Meet connection passed: setup, explicit authorization, connected/reconnect, callbacks, query preservation, retries and unsafe redirect rejection; desktop/mobile.");
} finally {
  await browser.close();
}
