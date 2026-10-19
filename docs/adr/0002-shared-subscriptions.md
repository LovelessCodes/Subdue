# ADR 0002 — Shared subscriptions

Status: accepted · 2026-10-19

## Context

Subscriptions belong to exactly one user: every read filters `subscription.user_id`, and the payer's bank statement is the only record of the charge. People routinely split a family plan or a shared server, but Subdue cannot represent that without duplicating the subscription per person — which produces two sources of truth for price, renewal and cancellation.

The constraints:

- One charge, one payer. Only the payer's statement carries it; a split must not double-count the charge in anyone's budget.
- Registered and unregistered people both participate. Not everyone will make an account.
- No system mailer. Invites cannot be emailed by Subdue today.
- Sign-up is open and email addresses are unverified. An invited email is a label, not proof of identity.
- Notes and payment methods can hold family-plan credentials. Members must not inherit them.

## Decision

**Keep one canonical `subscription` row owned by the payer, and add `subscription_member` rows for everyone else.**

### Schema

`subscription_member`:

| column              | notes                                          |
| ------------------- | ---------------------------------------------- |
| `id`                | text primary key                               |
| `subscription_id`   | FK → `subscription`, cascade delete            |
| `user_id`           | FK → `user`, nullable; null for a placeholder  |
| `display_name`      | required; the name the payer sees              |
| `email`             | nullable; owner-only label, never used as auth |
| `share_minor`       | integer, in the subscription currency          |
| `status`            | `placeholder` \| `invited` \| `active`         |
| `invite_hash`       | SHA-256 of the token; null unless invited      |
| `invite_expires_at` | 7 days from mint                               |
| `category_id`       | nullable; the member's own category            |
| `remind_enabled`    | boolean, default true                          |
| `created_at`        |                                                |

A partial unique index on `(subscription_id, user_id)` where `user_id is not null` keeps one row per person per subscription.

The owner is not a member row. The owner's share is `price - sum(member shares)`, which is what makes the invariant "shares sum to ≤ price" sufficient.

### Visibility

One predicate, used everywhere:

```
visible(s, me) = s.user_id = me
              OR EXISTS (member m WHERE m.subscription_id = s.id
                                       AND m.user_id = me
                                       AND m.status = 'active')
```

- List, dashboard, budget, calendar, iCal, reminders, notifications, export and the REST/MCP API all go through it.
- Writes stay owner-scoped (`s.user_id = me`); members never mutate the subscription.
- A non-member gets 404, not 403, on get/update/delete.

### Money

- The payer's budget, dashboard, calendar and inbox count the **full price** — gross cash out, matching the statement. The covered amount is shown as information ("DKK 120.00 covered").
- A member counts **their share** in their own currency, using the existing ECB conversion.
- Shares are amounts in the subscription currency, stored in minor units. No per-share currency.
- Shares must sum to ≤ price. The owner absorbs the remainder and rounding. A price drop that leaves the split over-allocated is a warning, never a silent rewrite.

### Invites

- A placeholder is name-only: no account, no token, no access. It counts in the split immediately.
- A registered invite is a one-time bearer token, hashed at rest, 7 days, revocable. The payer copies the link; Subdue does not send email.
- The accept screen requires sign-in. The token is the authority; the email is a label.
- Accepting links `user_id` and sets `status = 'active'`. The token is cleared.
- Members can leave; the row is deleted and their notifications for that subscription are deleted in the same transaction. Their share returns to the owner.

### Redaction

Members see: service name, logo, URL, price, currency, cycle, next payment, their share, their own category and reminder preference. They do not see: notes, payment method, other members, or the owner's totals. Co-member visibility is hidden by default.

### Reminders

The existing `notification` row is already per user, per subscription, per due date. The owner gets one at the full price; each member gets one at their share, on by default, with a per-member toggle. Removal deletes that member's notifications for the subscription — the inbox join would otherwise keep rendering them.

## Consequences

- The schema stays single-source. A price change, renewal or cancellation is one write.
- Every read path must use the visibility helper. A missed path is a leak, not a display bug; tests should assert member/non-member access on each surface.
- The subscription list becomes a mixed view: owner rows at full price, member rows at share price, with different edit affordances. The UI needs a "shared with you" marker.
- The old free-text `payer` column is gone (migration `0023`): ownership plus shares already answer who pays, and the label only created a second, contradictory answer to the same question.
- Export and the API need an explicit decision per field; they cannot reuse the owner query.
- A member who already tracks the service gets a duplicate. Merging is a follow-up, not part of v1.
- No email delivery means an invite is only as good as the link the payer sends. If Subdue ever gains a system mailer, the token flow does not change.
- Claim links for placeholders are a follow-up. In v1 a placeholder stays a label: no token, no access, removable at any time.
- Deleting the owner cascades the subscription and every member's access; the UI should warn before that happens.

## Alternatives considered

- **Duplicate the subscription per person.** Rejected: two sources of truth for price, date and cancellation; every aggregate needs dedupe logic.
- **Better Auth organization/household.** Rejected: all-or-nothing visibility, a large auth refactor, and it still does not model an unregistered person.
- **A separate `share` subscription with its own recurrence.** Rejected: recurrence drift and a second charge in the member's calendar.
