-- Seed parking_context setting with the current hardcoded parking description.
-- Editable via /admin/settings and injected into the AI email agent system prompt.
INSERT INTO torrinha_settings (key, value)
VALUES (
  'parking_context',
  to_jsonb($$Location: Rua da Torrinha 149, Porto (Bonfim neighbourhood)
Type: Private, covered, numbered underground parking
Vehicle types accepted: Cars, motorbikes, and bicycles

Pricing:
- Car: €120/month
- Motorbike: lower price, discuss case by case
- Bicycle: lower price, discuss case by case
- Remote control deposit: €50 (refundable on departure)

Rental terms:
- Long-term only — no short-term or temporary rentals
- 30 days notice required from both parties to end contract
- Payment monthly in advance via MBWay or bank transfer (IBAN)

Community:
- Small, friendly community — most tenants are friends-of-friends
- We value good neighbours — mention this warmly, never as a barrier

Waitlist:
- If no spots available, invite them to join: https://torrinha149.com
- Collect via conversation: name, email, phone, vehicle type, preferred start date
- Once all collected, add to torrinha_waitlist automatically$$::text)
)
ON CONFLICT (key) DO NOTHING;
