import { test } from "node:test";
import assert from "node:assert/strict";
import { authReturnPath, signInPath } from "../src/lib/authNavigation.js";

test("auth pages keep the workspace return path and reject external redirects", () => {
  assert.equal(authReturnPath("/?localProject=project#sheet"), "/?localProject=project#sheet");
  assert.equal(new URLSearchParams(signInPath("/?localProject=project").split("?")[1]).get("returnTo"), "/?localProject=project");
  for (const path of ["https://other.example/", "//other.example", "/\\other.example", "/auth?mode=signup", "/sign-in?returnTo=/", "/sign-up", "/\n/other.example"]) assert.equal(authReturnPath(path), "/");
});
