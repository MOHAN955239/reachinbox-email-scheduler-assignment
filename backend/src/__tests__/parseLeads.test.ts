import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLeadsFile } from "../utils/parseLeads";

test("extracts emails from a one-per-line txt file", () => {
  const buf = Buffer.from("alice@example.com\nbob@example.com\n");
  assert.deepEqual(parseLeadsFile(buf), ["alice@example.com", "bob@example.com"]);
});

test("extracts emails from a comma-separated CSV column", () => {
  const buf = Buffer.from("name,email\nAlice,alice@example.com\nBob,bob@example.com\n");
  const result = parseLeadsFile(buf);
  assert.ok(result.includes("alice@example.com"));
  assert.ok(result.includes("bob@example.com"));
  assert.equal(result.length, 2);
});

test("deduplicates and lowercases addresses", () => {
  const buf = Buffer.from("Alice@Example.com\nalice@example.com\nALICE@EXAMPLE.COM\n");
  assert.deepEqual(parseLeadsFile(buf), ["alice@example.com"]);
});

test("ignores non-email text", () => {
  const buf = Buffer.from("this is just some notes, not an address\n123-456-7890\n");
  assert.deepEqual(parseLeadsFile(buf), []);
});

test("returns empty array for empty input", () => {
  assert.deepEqual(parseLeadsFile(Buffer.from("")), []);
});
