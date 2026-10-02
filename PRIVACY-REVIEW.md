# Darecade privacy review — pre-launch working record

3 October 2026. This is an engineering review record, not a legal certification or approval to launch to children. The app remains a local test. Its 13+ month/year gate and teen-readable consent implement the supplied plan's intended flow.

The current [PDPC guidance on children's personal data in the digital environment](https://www.pdpc.gov.sg/guidelines-and-consultation/2024/03/advisory-guidelines-on-the-pdpa-for-childrens-personal-data-in-the-digital-environment) was consulted. Comprehension matters as well as age: where a young person cannot understand the implications, a self-signup checkbox is insufficient. The notice asks the player to stop and seek help if unclear. This app has no parental-consent workflow and must not be offered as an under-13 service.

| Data / purpose | Visibility and retention | Controls / outstanding work |
|---|---|---|
| Birth month/year / eligibility | Request memory only, not stored | Gate before identity creation; application does not log request bodies. Verify proxy/provider logs before hosting. Self-declaration is bypassable; no claim of verified age. |
| Age band and consent version/time / eligibility record | Private, profile lifetime | Teen 13–17 or adult 18+. Verify notice comprehension with representative users before beta. |
| Email / account access | Private, account lifetime | Ownership link, random tokens, hashes in DB, 15-minute one-use expiry. Local outbox for synthetic tests only. Confirm live provider terms, location, retention and sender domain. |
| Nickname, avatar, activities, position / shared neighbourhood | Visible to signed-in neighbourhood participants, profile lifetime | Presets only. Public reads require a consented session. Visibility is shared, not a private friends-only space. Explain this before consent. |
| Scores, XP, medals, dares / progression and fairness | Shared game results; private account details excluded | Server replay validation and reward ledger; no paid score advantage. Dares close after 24 hours; posted history remains with the account. |
| Recorded game inputs / result validation and review | Private, 30 days | Bounded payloads/ticks, ownership check, body-size limit, expiry, duplicate-result digest. Valid-input bots remain possible. |
| Safety reports and block relationships / moderation | Private to operator and reporting player | Preset reasons; duplicate/rate controls; no automatic punishment. Operator CLI can suspend/restore/erase. Assign a named moderator and response procedure before launch. |
| Optional phone feedback / usability testing | Operator only, profile lifetime | Explicit submission, included in export/deletion. Old prototype reports lack identity linkage; review separately before retaining or using in research. Avoid personal information in notes. |
| Session cookies / authenticated access | HttpOnly, SameSite, 30 days; Secure in production | Sign-out and global erasure revocation. Local Wi-Fi HTTP is only a test environment. Deploy HTTPS for any public/real-user service. |
| Rate-limit IP keys / abuse prevention | Memory only, short rolling windows | No persistent IP log in the app. Infrastructure logging and shared-NAT/proxy behaviour need deployment review. |
| Backups / recovery | No scheduled cloud backups configured | The pre-upgrade snapshot contains legacy prototype data only. Production needs restricted, encrypted storage, bounded expiry and deletion replay after restoration. Never restore erased accounts into a live service without applying erasures. |

Data minimisation: no full name, exact DOB, phone, photo, chat, advertising ID, payment data or location permission. World coordinates refer to the game only. No parent data is collected. No marketing or purchase consent is bundled into joining.

Access and withdrawal: own-data JSON download, explicit permanent-deletion confirmation and logout are available from Account & privacy. Deletion includes active database records, associated test feedback and pending links, and removes identifiers from other players' challenge references. It cannot retract messages already delivered by an email provider or erase unknown manually copied files. A production backup/provider erasure policy must be disclosed and tested.

Inactive cleanup: 12 calendar months from last authenticated activity. Session validity is shorter (30 days), with email recovery. Input replay cleanup is 30 days. Cleanup runs only while the service is up and resumes when restarted. Deletion of a profile also removes its cosmetic progress and competition records.

Before a public teen beta, the operator must complete: Singapore-region database/hosting selection; actual provider/location disclosure and cross-border assessment; monitored privacy contact; HTTPS and restricted server administration; abuse/load testing and proxy rate limits; live sign-in delivery and recovery testing; moderation ownership and under-age report procedure; backup/restore/erasure drill; notice comprehension review and physical iPhone/Android testing. Production mode refuses missing email, HTTPS-origin and privacy-disclosure configuration, but configuration alone is not evidence these operational checks passed.
