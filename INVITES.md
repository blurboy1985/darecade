# Invite a friend

Added on 4 October 2026. Every player has an invite link. When a friend who is new to Darecade follows it and finishes a first round, both players get 30 XP.

## For the player

- **Menu → Friends → Neighbours → Bring a friend**, or **Play with a friend** on a result card, opens the Invite window.
- The window shows the link, a Share button where the device has a share sheet, a Copy button, and how many friends have played.
- A friend who opens the link goes through the usual age check and privacy notice. After agreeing they see who invited them. When they finish their first round, their result card shows the extra 30 XP.

## Rules

- The link is `/?invite=CODE`. The code is eight random characters and is not the player's id. It is removed from the address bar on arrival and kept only until the new player has agreed to the privacy notice.
- Only a profile that has never finished a round can accept, once. A player cannot accept their own link, or a second link from someone else.
- Nothing is paid for joining. Both rewards are paid once, when the new player's first round is verified by the server.
- The inviter is paid for at most five friends: 150 XP in all. Friends after the fifth still get their own 30 XP.
- A link stops working if its owner deletes their account or is suspended.

## Privacy

- The game never asks for a friend's name, email or phone number. Sharing goes through the device's own share sheet or the clipboard.
- The inviter sees counts only: how many friends joined and how many have played. The newcomer sees the inviter's nickname, which neighbours can already see.
- The server stores the code and, for each accepted invite, the two player ids, the time and whether it has been paid. Both are erased when either account is deleted, and the data export includes the player's own code and counts.
- No new personal data is collected, so the privacy notice version is unchanged. The notice does not yet mention invite links; that wording is the operator's decision.

## Limits

Guest profiles are free to create, so one person could follow their own link in another browser and play a round each time. The cap bounds that to 150 XP. If XP ever buys something worth money, the cap should be reviewed with that in mind.

## Purchases

Not part of this change. Stripe checkout for cosmetic sets is being built separately and is not on `main`. Prompts that lead to it should be added once it is merged, and should stay plain: show the price and what it unlocks, with no countdowns, no invented scarcity and no repeated nagging, since players include 13 to 17 year olds.

## Source

`server/community-core.mjs` (`invite`, `acceptInvite`, `payInvite`), `server/index.mjs` and `cloudflare/api.mjs` (routes), `src/invite.ts`, `src/main.ts`, `tests/invite.test.ts`.
