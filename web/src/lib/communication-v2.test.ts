import {
  assertBudget,
  classifyFailure,
  estimateSms,
  prepareSms,
  retryDelay,
  validatedChadPhone,
} from "./communication-v2.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("signed SMS estimate includes extended GSM and Unicode multipart", () => {
  assert.equal(estimateSms(prepareSms("a".repeat(154), ""), 50).segments, 2);
  assert.equal(estimateSms("^".repeat(81), 50).cost, 100);
  assert.equal(estimateSms("ع".repeat(71), 50).segments, 2);
  assert.equal(estimateSms("😀".repeat(36), 50).segments, 2);
  assert.throws(() => estimateSms("x", -1));
});
test("budget rejects bypass, overspending, invalid values, permits exact bound", () => {
  assert.throws(() => assertBudget(50, 0, 0, 100, 0, false));
  assert.throws(() => assertBudget(50, 50, 50, 100, 0, true));
  assert.throws(() => assertBudget(NaN, 0, 0, 100, 0, true));
  assert.doesNotThrow(() => assertBudget(50, 0, 50, 100, 50, false));
});
test("phone validation does not turn foreign and seed numbers into valid campaigns", () => {
  assert.equal(validatedChadPhone("+33123456789").failure, "INVALID_NUMBER");
  assert.equal(validatedChadPhone("+23561000123").failure, "SUSPECT_NUMBER");
  assert.equal(validatedChadPhone("66123478").phone, "+23566123478");
});
test("failure reasons have actionable categories and bounded jitter", () => {
  for (const [error, category] of [
    ["unsupported_operator_moov", "UNSUPPORTED_OPERATOR"],
    ["402", "BALANCE"],
    ["429", "RATE_LIMIT"],
    ["timeout", "TIMEOUT"],
    ["invalid_phone_length", "INVALID_NUMBER"],
    ["401", "CONFIGURATION"],
    ["503", "UNAVAILABLE"],
    ["other", "UNKNOWN"],
  ])
    assert.equal(classifyFailure(error), category);
  assert.equal(retryDelay(1, 0), 30_000);
  assert.equal(retryDelay(1, 1), 60_000);
  assert.equal(retryDelay(100, 1), 3_600_000);
  assert.throws(() => retryDelay(0, 1));
});
