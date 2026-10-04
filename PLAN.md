# Invite a friend

Branch `invite-friends`, from `origin/main`. Separate from PRs #11 to #15.

## Task

Give players a reason and a way to invite friends, and to buy things in the game.

## Findings

- **Purchases are already in progress elsewhere.** The main working folder holds uncommitted Stripe checkout work for cosmetic sets (`PAYMENTS.md`, `server/payments.mjs`, `src/wardrobe.ts`). Nothing purchasable exists on `origin/main`, and the privacy notice there says no purchases are enabled. Purchase prompts built here would have nothing to point at and would collide with that work, so they wait for it to land.
- **Friends exist only as neighbours.** A player can join a friend's world from the Worlds window, but there is no way to bring someone new in.
- Players are 13 and over, including teens. Invitations must not collect anyone's contact details, and rewards must not be farmable into something worth money.

## Design

- Every player has an invite link, `/?invite=CODE`. Sharing uses the device's share sheet or copy; the game never asks for a friend's email or number.
- A new player who arrives by a link is tied to the inviter once they have agreed to the privacy notice.
- When the new player finishes their first verified round, both get 30 XP. The inviter is paid for at most five friends, 150 XP in all. Later invites still work but pay the inviter nothing.
- Only a brand-new profile can accept, once, and never its own link.
- The inviter sees counts, never names. The newcomer sees the inviter's nickname, which neighbours already see.
- Entry points: the Neighbours window, and the result card after a round.

## Steps

1. `server/community-core.mjs`: tables, `invite`, `acceptInvite`, payout in `finish`, cleanup in `delete`, export. Routes in `server/index.mjs` and `cloudflare/api.mjs`.
2. `src/invite.ts` and `src/main.ts`: link capture, accept, the Invite window, entry points.
3. `tests/invite.test.ts`; `INVITES.md`, `README.md`, `QA.md`.

## Verify

- `npm test`, `npm run build`, `npm run test:cloudflare`.
- Browser: copy a link as one guest, open it as a second guest, finish a round, see both rewards.

## Decisions for Daniel

- Purchase prompts: which catalogue and checkout they point at, once the payments work is merged.
- Whether the privacy notice should mention invite links. No new personal data is collected, so the version is not bumped here.
