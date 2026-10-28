# Claude Code Prompt — Feature-Rich Product Backlog

> **Paste this whole file into a new Claude Code chat** (after Tasks 22–24 rails are stable, or in parallel as **docs-only** work).
> Do **not** implement product code in this chat — backlog + task files only.

---

```
@AGENTS.md @docs/AGENT_PLAN.md @docs/ROADMAP.md @docs/TASKS/INDEX.md @docs/CHECKLIST.md
@apps/agent-portal/components/dashboard/RetailerDashboard.tsx
@apps/agent-portal/components/dashboard/DistributorDashboard.tsx
@apps/agent-portal/components/dashboard/SuperDistributorDashboard.tsx
@docs/TASKS/23-provider-admin-panel.md
@docs/TASKS/24-financial-safety-layer.md

GOAL (docs only — no app code, no explore beyond listed paths):
Convert the Feature-Rich Depth brief below into a concrete AsanPay product backlog.

OUTPUT — create these files (English product copy; Hindi OK only in agent notes):
1. docs/PRODUCT/feature-rich-backlog.md
   - Role-wise user stories (Admin / Super Dist / Dist / Retailer / Cross-role)
   - Per story: API scope, DB tables/columns (sketch), UI screens (apps/admin-portal | apps/agent-portal | mobile)
   - Effort points (1/2/3/5/8), Tier (1/2/3), KPI it moves
2. docs/PRODUCT/feature-rich-90day.md
   - Month 1 / 2 / 3 sprint plan mapping stories → weeks
   - Explicit DEPENDS ON: finish 22→23A→24→23B before money-rail risk features
3. docs/TASKS/26-*.md … split into MAX 40-line task files (copy _TEMPLATE.md)
   - One chat-sized slice per file; L/XL must be split
4. Update docs/TASKS/INDEX.md + docs/ROADMAP.md with new Phase 6 “Feature depth”
5. Update docs/CHECKLIST.md with unchecked items for the new tasks

HARD CONSTRAINTS (do not violate):
- Role dashboards ALREADY exist (SD / Dist / Retailer). Do NOT create “build dashboard” stories.
  Frame as dashboard v2 WIDGETS / queues / alerts on existing homes.
- Admin Providers + txn detail + financial safety = Tasks 22–24. Do NOT duplicate as new Tier-1 work;
  reference them as foundation. Admin “Provider Reliability Studio” = extend Task 23, not greenfield.
- UI language: English only in all product strings.
- Provider parity: any provider-backed service needs web + mobile entrypoints unless
  a doc marks an explicit platform exception.
- Money rails: NO blind alternate-rail failover on timeout. Recovery = recheck / clear next action /
  clean fail (align Task 24). “Alternate rail suggestions” = advisory only until policy engine exists.
- BBPS / Travel / UPI Cash Point / commission simulator on BBPS: mark BLOCKED until provider docs +
  adapter exist. Prefer DMT/AEPS/wallet/KYC for early stories.
- Postgres only. No Mongo. Ignore partner-web, retailer-web.
- No AI git attribution in any commit message if you commit (prefer no commit unless asked).
- Voice-assisted Hindi+English: defer to Tier 3+ / research; do not put in Month 1–2 tasks.
- White-label brand controls: out of 90-day scope.
- AI copilot / full offline-first / risk graph ML: Tier 3 or later; Month 3 = “lite” only.

FEATURE-RICH MEANING (use as acceptance north star):
- Faster txn completion, fewer retries
- Higher per-agent earnings + better float utilization
- Stronger risk/compliance controls
- Visibility: who earns, who is stuck, where money is blocked
- Lower support load via self-serve ops

TIER ORDER (keep this stack):
Tier 1 — Retailer smart home + templates; Dist action queue; SD P&L summary widgets;
         Admin provider reliability (on Task 23); Unified alert center
Tier 2 — Failure recovery workbench; Float planner; Commission simulator (unlocked services only);
         KYC assisted completion; Support tickets with txn context
Tier 3 — Policy engine lite; Maker-checker; Recon command center; Compliance vault;
         Anomaly insights v1

ROLE DEPTH (stories must show workflow + control + revenue, not feature names only):
Admin: Policy engine, maker-checker risk tiers, recon center, compliance vault,
       provider reliability, incident playbooks
SD: Network P&L, float planner, commission scenario sim, hierarchy health index,
    collections/exposure, expansion funnel
Dist: Retailer action queue, assisted KYC, failure recovery workbench, goal coaching,
      route-to-resolution tickets
Retailer: Smart counter home, assisted txn guard, customer memory, earnings lens,
          trust/transparency pack, personal risk shield
Cross: Event-driven alerts, recommendation nudges, recovery-first txn UX, explainable blocks

WEEKLY KPIs to attach to stories:
Txn success by service/role; pending aging >15m / >2h; retries per fail;
active retailers per dist; revenue per active retailer; KYC TAT;
fraud prevented; tickets per 1000 txns; float idle / stockout; D7/D30 retention

DONE WHEN:
- Backlog + 90-day plan + split task files + INDEX/ROADMAP/CHECKLIST updated
- Every Tier-1 story has clear “extends existing dashboard X” note where relevant
- No story asks to rebuild SD/Dist/Retailer dashboards from scratch
- Blocked items explicitly labeled BLOCKED + reason

No explore. No MCP. Mac Terminal cmds only if needed for git status. Do not implement features.
```

---

## Validated notes (human — for you, not Claude)

| Claim in brief | Verdict |
|----------------|---------|
| Feature-rich = depth not list | Correct |
| Tier 1–3 + 90-day blueprint | Correct order |
| Role dashboards as Month 1 “v2” | OK if **widgets**, not rebuild |
| Admin provider reliability first | Aligns with Task 23 |
| Alternate rail / dynamic routing | Dangerous until Task 24 + policy lite |
| BBPS in commission sim Month 2 | Premature without docs |
| Maker-checker / recon Month 3 | Right layer after rails |

**Do this prompt AFTER or alongside docs-only while 22–24 ship in other chats.**
