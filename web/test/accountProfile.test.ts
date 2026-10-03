import { test } from "node:test";
import assert from "node:assert/strict";
import { accountProfile } from "../src/lib/supabase/accountProfile.js";
test("account identity defaults to Google name/photo and preserves a custom display name", () => {
 const user = { email: "person@example.com", user_metadata: { full_name: "Google Person", avatar_url: "https://example.com/avatar.png" } };
 assert.deepEqual(accountProfile(user), { name: "Google Person", email: "person@example.com", avatar: "https://example.com/avatar.png", initials: "GP" });
 assert.equal(accountProfile(user,"Edited Name").name,"Edited Name");
 assert.equal(accountProfile({...user,user_metadata:{...user.user_metadata,display_name:"Auth Name"}}).name,"Auth Name");
});
test("identity safely falls back for absent or invalid photo/name metadata", () => {
 assert.equal(accountProfile({email:"person@example.com"}).name,"person@example.com");
 assert.equal(accountProfile({user_metadata:{avatar_url:"javascript:alert(1)",picture:"https://example.com/p.png"}}).avatar,"https://example.com/p.png");
 assert.equal(accountProfile({user_metadata:{avatar_url:"http://example.com/p.png"}}).avatar,"");
 assert.equal(accountProfile(null).initials,"A");
});
