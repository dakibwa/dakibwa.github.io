import assert from "node:assert/strict";
import worker from "./index.mjs";

for (const [source, expected] of [
  ["https://www.portuguesewithines.com/", "https://portuguesewithines.com/"],
  ["http://www.portuguesewithines.com/book/", "https://portuguesewithines.com/book/"],
  [
    "https://www.portuguesewithines.com/booking-terms/?from=footer",
    "https://portuguesewithines.com/booking-terms/?from=footer"
  ]
]) {
  const response = worker.fetch(new Request(source));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), expected);
}

console.log("3 www redirect tests passed.");
