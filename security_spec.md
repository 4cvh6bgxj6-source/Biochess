# BioChess Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. Zero PII (`email`, `phone`, `address`) is ever written to `/users/{uid}` or any public collection.
2. Every user profile `/users/{uid}` can only be created or modified by `request.auth.uid == uid` with verified email (`request.auth.token.email_verified == true`), initial `elo == 300`, `wins == 0`, `losses == 0`, `draws == 0`, and atomic creation alongside `/usernames/{key}`.
3. Usernames `/usernames/{usernameKey}` are immutable once claimed (`update`, `delete` forbidden) and enforce uniqueness at write time.
4. Challenges `/challenges/{challengeId}` can only be read, queried, or updated by `fromUid` or `toUid`, cannot target oneself (`fromUid != toUid`), require the target user to exist, and lock permanently once `status != 'pending'`. Accepting a challenge requires atomic creation of `/games/{gameId}` via `existsAfter`.
5. Games `/games/{gameId}` can only be read, listed, or updated by participants (`whiteUid` or `blackUid` matching `request.auth.uid`). Once `status` becomes terminal (`!= 'active'`), game moves/resigns/draw-offers are permanently blocked; only individual ELO claim flags (`whiteEloApplied` by `whiteUid`, `blackEloApplied` by `blackUid`) and rematch linking (`rematchRequestedBy`, `rematchGameId`) are permitted.
6. Subcollections `/games/{gameId}/moves/{moveId}` and `/games/{gameId}/messages/{messageId}` enforce the Master Gate (`get()` on parent `/games/{gameId}` checking participant UID) and atomicity (`getAfter` checking `movesCount == existing + 1` on move create).

## 2. Adversarial Test Matrix ("Dirty Dozen" Payloads -> Expected PERMISSION_DENIED)
1. **Unauthenticated read/write**: `request.auth == null` reading `/users/u1` or `/games/g1` -> DENIED.
2. **Unverified email write**: `request.auth.token.email_verified == false` creating `/users/u1` -> DENIED.
3. **Self-assigned high ELO on signup**: Creating `/users/u1` with `elo: 2800, wins: 99` -> DENIED (must start at `elo == 300, wins == 0, losses == 0, draws == 0`).
4. **Shadow field injection ("Ghost Field")**: Updating `/users/u1` with `{ online: true, isAdmin: true }` -> DENIED (`hasOnly` blocks unknown fields).
5. **Username hijacking**: Updating or deleting `/usernames/marco94` to point to attacker `uid` -> DENIED (`update, delete: false`).
6. **Orphan username claim**: Creating `/usernames/fake` without creating `/users/{uid}` in the same batch -> DENIED (`existsAfter` check fails).
7. **Challenge spoofing**: Creating `/challenges/c1` with `fromUid: "victim_uid"` -> DENIED (`fromUid == request.auth.uid`).
8. **Accepting challenge without creating game**: Updating `/challenges/c1` to `{ status: "accepted", gameId: "nonexistent" }` -> DENIED (`existsAfter(/games/nonexistent)` fails).
9. **Unauthorized game move**: Non-participant writing `/games/g1/moves/0000` -> DENIED (Master Gate `get()` fails).
10. **Terminal game tampering**: Playing a move or overwriting `winner` after `status == 'checkmate'` -> DENIED (Terminal State Locking).
11. **Oversized string poisoning**: Writing `fen` with 10,000 characters or `id` with `../evil` -> DENIED (`size()` and `isValidId()` regex fail).
12. **Client-delegated list scraping**: Listing `/challenges` or `/games` without constraining query to `request.auth.uid` -> DENIED (`allow list` evaluates `resource.data`).
