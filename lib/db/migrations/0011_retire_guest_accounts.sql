-- Guest auto-provisioning is gone: any request without a session used to be
-- handed a brand-new account, so an instance accumulated one identity per
-- visit. Those rows are inert — no provider can authenticate them and their
-- password hashes are random UUIDs nobody holds — but they are identities in
-- the users table that no longer mean anything, and they clutter the only
-- place an operator looks to see who can sign in.
--
-- Guest emails were minted as `guest-<epoch ms>` (lib/db/queries.ts, removed
-- in the same change), so the pattern is exact rather than a guess.
DELETE FROM "User" WHERE email ~ '^guest-[0-9]+$';
