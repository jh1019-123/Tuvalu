# Tuvalu: Laguna Chef — Security Specification (Phase 0)

## 1. Data Invariants
1. **Owner-Only Private Profile (`/users/{userId}`)**: Only an authenticated, email-verified user whose `request.auth.uid == userId` may read, create, or update their own `/users/{userId}` document. Listing `/users` is strictly denied (`allow list: if false`).
2. **Identity & Immutable Fields**: `uid` and `createdAt` are immutable after creation. `uid` must always equal `request.auth.uid`.
3. **Server Timestamp Integrity**: `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
4. **Monotonic Win Progression**: A player cannot arbitrarily inflate `wins`, `losses`, or `totalBattles` in a single update (`wins` may increase by at most `1` per update; `totalBattles == wins + losses`).
5. **Public Leaderboard Integrity (`/leaderboard/{userId}`)**:
   - No PII (no email, phone, or address) is stored in `/leaderboard/{userId}`.
   - Only entries with `isPublic == true` are readable in `get` or `list` queries.
   - Only the verified owner (`request.auth.uid == userId`) can publish or update their leaderboard entry, and the published `wins` must match their `/users/{userId}` profile's `wins` (`getAfter` consistency check).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Profile Write**: Unauthenticated `CREATE /users/user1` -> `PERMISSION_DENIED`.
2. **Cross-User Profile Hijack**: User A (`uid: alice`) tries `UPDATE /users/bob` -> `PERMISSION_DENIED`.
3. **UID Spoofing**: User A (`uid: alice`) tries `CREATE /users/alice` with `{ uid: "bob", ... }` -> `PERMISSION_DENIED`.
4. **Ghost / Shadow Field Injection**: User A sends `{ ..., isAdmin: true }` in `CREATE /users/alice` -> `PERMISSION_DENIED`.
5. **Unverified Email Write**: User A with `email_verified: false` tries `CREATE /users/alice` -> `PERMISSION_DENIED`.
6. **Client-Forged Timestamp**: User A sends `updatedAt: "2099-01-01T00:00:00Z"` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
7. **Win Count Inflation Attack**: User A updates `/users/alice` jumping `wins` from `2` to `999` -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: User A tries to change `createdAt` or `uid` on `/users/alice` update -> `PERMISSION_DENIED`.
9. **Resource Exhaustion (1MB String)**: User A sends a 2,000-char string in `displayName` or `userId` path -> `PERMISSION_DENIED`.
10. **PII / User Scraping (`list /users`)**: User A runs `getDocs(collection(db, 'users'))` -> `PERMISSION_DENIED`.
11. **Leaderboard Fake Wins Without Profile Sync**: User A tries to publish `wins: 50` to `/leaderboard/alice` when `/users/alice` only has `wins: 3` -> `PERMISSION_DENIED`.
12. **Hidden / Private Leaderboard Query Bypass**: User A queries `/leaderboard` without `where('isPublic', '==', true)` or sets `isPublic: false` and tries to list -> `PERMISSION_DENIED`.
