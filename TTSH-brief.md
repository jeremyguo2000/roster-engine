# Roster Engine — briefing for the TTSH meeting

Plain-English notes on the five things you're most likely to be asked to
explain. Written to be read before the meeting, not during it.

Everything here is checked against the code as of 11 Aug 2026.

---

## 0. The one-paragraph version

The product is a **solver** with a web app around it. You describe your
department — staff, what each is qualified for, what shifts exist, how many
people you need on the floor in each time window — and it fills in a grid: one
row per person, one column per day, one shift code per cell. It doesn't just
find a *legal* roster, it searches for the *fairest* legal one, by a score it
minimises. That last part is the difference between this and a rules engine
with a validator on the end.

---

## 1. What a Profile is

**Say:** "A profile is a saved department setup — who's in it, what shifts they
can be given, and how the engine should weigh its trade-offs."

Concretely a Profile holds three things:

1. **Which staff participate.** Usually added a whole staff group at a time.
2. **Which shifts participate.** Including the leave codes (AL, MC, HL) — if a
   leave code isn't in the profile, a solve involving that leave *fails*, so
   they're always included.
3. **A `config` blob** with the solver settings: the five objective weights,
   the `time_limit`, and the conditional rules (§5).

**Why it exists:** it separates "how this department works" from "the roster I
am generating right now". You set the profile up once; generating a roster then
only asks for dates, hours target, and demand.

**The question to expect:** *"Can I have different rules for different sites?"*
Yes — one profile per site. But staff cannot currently be **shared** across
profiles with borrowing rules; that's a known future direction. If TTSH runs one
pool of radiographers across several locations, say so plainly: today you'd model
that as separate profiles, and cross-site borrowing isn't built.

---

## 2. Roster chaining

**Say:** "Rosters don't restart from zero. When you generate the next fortnight,
it knows what the last one ended on."

When you pass a previous roster, the system rebuilds that solved roster and
derives three carry-over facts (`RosterContext` in `solver/solver.py`):

| Carried over | What it's for |
|---|---|
| `carry_consec` | How many days in a row each person was *already* working, so day 1 of the new roster doesn't hand someone their 9th consecutive shift |
| `carry_shifts` | Each person's most recent shift group and how many days ago, so rest rules ("no shift the day after a night") still fire across the boundary |
| `carry_night_shifts` | Who was on an overnight shift on the *last day* of the previous roster — because they're still physically on the ward at 6am on day 0, and they **count toward day-0 early-morning coverage** |

That third one is the detail worth mentioning out loud. It's the sort of thing
that's obviously right once stated and that a hand-built or per-cycle system
usually gets wrong: the night nurse who works 2030→0730 across the boundary is
real cover on the new roster's first morning, and the engine counts them.

**Why this matters commercially:** it's your answer to the 6-week cycle question
(§ "scale" below). Three chained fortnights beat one 42-day solve.

**Honest limitation:** the link isn't stored. `previous_roster_id` is an argument
to the solve, not a column on the roster, so after the fact nothing can tell you
what a given roster was chained from. It's a one-column fix.

---

## 3. The audit panel

**Say:** "After the solver returns a roster, a completely separate piece of code
re-checks it against every rule and reports what it finds."

This is the strongest engineering story you have, so get the point right:

The audit (`solver/validate.py`) is **deliberately not built on the solver's own
helpers**. Every rule is re-derived from the raw grid using only the shift
definitions. The reason: if the solver has a bug in how it encoded a rule, an
audit that reused the same code would have the same bug and would happily agree.
Two independent implementations are unlikely to be wrong in the same way.

It's also *stricter than the solver in one place*. The solver checks demand
coverage only at boundary "check points" (sampling). The audit walks **every
minute of every demand window**. So it can surface genuine under-coverage at
times the solver's own check skipped.

The rules it names, in operator language: one shift per day · contracted hours ·
shift cover · permitted shifts · booked leave · days without demand · rest rules ·
consecutive days.

**Expect:** *"So does it ever find violations?"* Good answer: it shouldn't, and
in normal operation it doesn't — it's there so that if the solver is ever wrong,
you find out from your own software rather than from a nurse. Note that an empty
result ("checked, all clear") and no result at all ("never checked") are shown
differently, which matters for rosters generated before the audit existed.

---

## 4. The sick-call flow (replacement suggestions)

**Say:** "Someone calls in sick. Rather than re-run the solver and reshuffle a
published roster, it tells you who to phone, in order."

No CP-SAT runs. Everything is read off the already-solved roster, so it's
instant. The logic (`solver/swaps.py`):

**Step 1 — what actually breaks.** It removes the absent person and walks every
minute of every demand on the absence day *and the day after* (a night shift
affects the next morning). It reports which demands fall short, by how many, and
at which minute — so you know whether you even need a replacement.

**Step 2 — who's eligible.** Everyone is excluded for a stated reason, and the
reasons are tallied so you can see why the list is short:

- already working that day / on leave that day
- not permitted to work that shift code
- would breach a rest rule (checked in **both** directions — taking this shift
  mustn't clash with what they're doing the day before *or* after)

**Step 3 — ranking.** Least-disruptive first:

1. people who close the coverage gap outright, before people who only partly do
2. then whoever is furthest from going into overtime
3. then whoever is most rested (shortest run of consecutive days)
4. then whoever is carrying the lightest night + weekend load so far

**The deliberate design decision to mention:** contracted hours are *not*
enforced here. Covering an extra shift puts someone over their exact target —
that is what overtime *is*. Excluding on those grounds would return an empty list
every time. So it's reported per candidate as `target_delta` and left to the
ward manager to decide.

**Positioning against TTSH:** they already have swaps with conflict alerts.
Theirs validates a choice you've made; yours **finds and ranks the choices**.
Say it that way round.

**Honest limitation:** because chaining isn't persisted (§2), a rest rule
triggered by a shift in the *previous* roster is invisible to the suggester.

---

## 5. The fairness objective — your differentiator

**Say:** "It doesn't just produce a legal roster. It searches for the fairest
legal roster, and fairness is defined explicitly, in numbers you control."

The engine minimises a weighted sum of three things (defaults shown, all
configurable per profile):

| Term | Weight | Plain English |
|---|---|---|
| max consecutive working days | **100** | Nobody should get a long unbroken run |
| overstaffing spread | **20** | Don't have a wildly overstaffed Tuesday and a bare Thursday |
| worst night/weekend burden | **10** | The unluckiest person's share of nights and weekends, where a night counts double a weekend |

Two things to understand about this:

- All three are **minimax** — they penalise the *worst-off individual*, not the
  average. That's what makes it a fairness objective rather than an efficiency
  one. It's also why the solver takes longer to prove optimality: minimax
  objectives are hard to close.
- The weights are yours to set. If a department cares more about even staffing
  than about consecutive days, that's a config change, not a code change.

**This is the thing TTSH's system appears not to do.** Their published material
describes an engine plus validation rules, conflict detection and compliance
checks — that produces a roster that is *legal*. Nothing there suggests it
optimises for fairness. Lead with this and stay on it.

### The hard rules (for reference — you won't be asked to recite them)

C1 at most one work shift per person per day · C2 exactly the contracted minutes
over the cycle · C3 demand coverage · C4 permitted shifts only · C5 pre-assigned
leave is fixed · C6 no work on days with no demand · C7 the conditional if/then
rules.

C7 is the configurable one: "if any night shift on day *d*, then block all shifts
on day *d+1*". Trigger group, offset (can be negative), enforce group, and
whether to block or force. That's how department-specific rest policies get in
without touching code.

---

## 6. Scale — the numbers you measured

Synthetic radiography department, this laptop-class VM, no GPU:

| Scenario | First valid roster | Quality | Longest run |
|---|---|---|---|
| 30 staff × 14 days | 0.4s | proven optimal | 3 days |
| **170 staff × 14 days** | **2.3s** | 21% gap at 300s | 4 days |
| 170 staff × 42 days | 123s | 68% gap at 600s | 6 days |

**The finding:** headcount is nearly free; the length of the cycle is what costs.
170 people is not a problem. Six weeks in one solve is where it gets hard.

**So the answer to "does it scale to 170?"** is: yes — and you'd run it as three
chained fortnights, not one 42-day block. Faster, and better balanced (4
consecutive days vs 6).

**Say it's indicative.** It's a synthetic department, not their data. Offer to
re-run it on a real anonymised cycle — that offer is worth more than the numbers.

---

## 7. The three things to volunteer before he finds them

Say these yourself, early. Against someone who has already shipped a system,
volunteering the gaps is what makes everything else you say credible.

**1. No manual cell editing.** Their pipeline has "Edit Roster" as a designed-in
stage in *both* lanes. Yours has no edit at all — you regenerate. The fix is
designed (lock the past, re-solve the future with a churn penalty so it changes
as few cells as possible) but not built.

**2. Hours targets are per-roster, not per-staff.** This is your likely hard
blocker: TTSH runs 42 hr/week non-shift and 40 hr/week shift staff, and those two
groups **cannot currently coexist in one profile**. Same root cause means unpaid
leave can't be expressed either. Fix is per-staff targets, or softening the
exact-hours rule to a penalty.

**3. No infeasibility diagnosis.** If it can't find a roster, it says so but not
*which* rule made it impossible. They have "insufficient resources detection", so
they'll notice. Worth adding: your audit does catch under-coverage after the
fact, minute by minute — what's missing is the up-front diagnosis.

---

## 8. Things not to do

- **Don't demo the sick-call flow as if swaps are new to them.** They have swaps.
  Frame it as search-and-rank vs validate-a-choice.
- **Don't promise identical output from identical input.** The solver is
  parallel and stops on a wall clock, so two runs of the same generate can give
  two different (equally good) rosters. Get ahead of it: every roster satisfies
  every hard rule — when several score equally, you get whichever was found
  first.
- **Don't quote a solve time.** Quote the cap. "Capped at two minutes, usually
  well inside it."
- **Don't oversell the chat assistant's model story.** It runs against any
  OpenAI-compatible endpoint including on-prem — that's true and it's a good
  story. What it needs is reliable tool-calling, which smaller open models are
  weaker at. Don't claim a specific on-prem model works until it's been tried.
