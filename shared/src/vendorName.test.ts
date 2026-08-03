import test from "node:test";
import assert from "node:assert/strict";
import { canonicalVendorName, isSameVendor, vendorKey } from "./vendorName.js";

/* Every case is a spelling pair actually present in the source sheets.
   Left unhandled, each one splits a single vendor across two KPI rows. */

test("S&P and its spelled-out form are one vendor", () => {
  assert.ok(isSameVendor("S&P", "S and P Freight, Inc"));
  assert.equal(canonicalVendorName("S&P"), "S&P Freight");
  assert.equal(canonicalVendorName("S and P Freight, Inc"), "S&P Freight");
});

test("trailing punctuation on a legal suffix does not fork the vendor", () => {
  // Sheet 1 writes "Priority1, Inc." and Sheet 2 "Priority1, Inc".
  assert.ok(isSameVendor("Priority1, Inc.", "Priority1, Inc"));
  assert.equal(canonicalVendorName("Priority1, Inc."), "Priority1");
});

test("a country suffix does not fork the vendor", () => {
  assert.ok(isSameVendor("ALPI", "ALPI USA"));
  assert.equal(canonicalVendorName("ALPI USA"), "ALPI");
});

test("Utopia's variants collapse to one entity", () => {
  assert.ok(isSameVendor("Utopia", "Utopia Trucking"));
  assert.equal(canonicalVendorName("Utopia Trucking"), "Utopia");
});

test("hyphen and space spellings match", () => {
  assert.ok(isSameVendor("Echo-Global", "Echo Global"));
  assert.ok(isSameVendor("C-Group", "C Group"));
});

test("distinct vendors stay distinct", () => {
  assert.equal(isSameVendor("Marlin Shipping", "MLM Transport"), false);
  assert.equal(isSameVendor("ALPI", "Priority1"), false);
  assert.equal(isSameVendor("CBS Trucking", "Barakat Transport"), false);
});

test("an unknown vendor is echoed, not invented", () => {
  // Guessing a "proper" spelling for a vendor we have no mapping for would be
  // worse than showing exactly what the operator typed.
  assert.equal(canonicalVendorName("Northwind Drayage LLC"), "Northwind Drayage LLC");
  assert.equal(vendorKey("Northwind Drayage LLC"), "northwind drayage");
});

test("blank and null inputs are handled", () => {
  assert.equal(vendorKey(null), null);
  assert.equal(vendorKey("   "), null);
  assert.equal(canonicalVendorName(""), null);
  assert.equal(canonicalVendorName(undefined), null);
});

test("keys are stable across casing and spacing", () => {
  assert.equal(vendorKey("  MARLIN   SHIPPING  "), vendorKey("Marlin Shipping"));
});
