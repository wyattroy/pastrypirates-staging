# IS A WIDER NAMING AUDIT WORTH IT? MEASURED, NOT GUESSED

2026-08-31. Wyatt asked after the `p` rename: *"is it worth auditing the rest of the code for
lazily named variables that make tracing harder?"*

**Yes — but for one third of them, and the useful test is not LENGTH.**

## The wrong question and the right one

Counting short names finds 16 identifiers with 30+ declarations each, which suggests a huge job and
tells you nothing. **A short name is only expensive when the SAME name means DIFFERENT THINGS**, so
the measurement is: for each identifier, what properties get accessed on it, and do those fall into
more than one kind of object?

## What that says

| name | uses | means |
|---|---|---|
| **`e`** | **366** | a DOM element AND a player AND a prompt AND an event |
| **`p`** | **253** | a DOM element AND a player *(in the files not yet converted)* |
| `b` | 173 | element, player, prompt, event |
| `g` | 177 | prompt AND event |
| `r` | 164 | element AND prompt |
| `q` | 126 | player AND event |
| `o` | 99 | player, prompt, event |

And the other side, which is the part that saves the work:

| name | uses | means |
|---|---|---|
| `d` | 53 | always a DOM element |
| `t` | 37 | always a DOM element |
| `a` | 15 | always a DOM element |
| `n` | 12 | always a DOM element |

**Renaming those four would be churn.** A name that always means one thing is cheap to read however
short it is; `i` for an index costs nobody anything.

## What it already cost, so this is not hypothetical

- **A gate could not tell a player from a prompt.** `decider_table_check` flagged `p.kind === "ask"`
  as a second way of asking whether a seat is human. It is the PROMPT's kind. I had to narrow that
  gate and write the limitation into its header.
- **Three gates broke on the rename**, none testing anything that changed — they were pinned to the
  variable's spelling (§12j).
- **I broke the game twice automating it**, both times with all 62 gates green, both caught by
  reading output rather than by any check.

## Recommendation

1. **Do `e` next.** It is the worst by a distance — 366 uses across four kinds of object — and it is
   the classic `event`/`element` collision that every reader has to disambiguate from context.
2. **Then the rest of `p`**, which lives mostly in `src/engine/index.js` and was left alone today.
3. **Leave `d`, `t`, `a`, `n`, `i`.** One meaning each.
4. **Small verified batches, never a sweep.** The verification that works is: a pure swap
   (insertions equal deletions), a grep of every remaining occurrence read by eye, and explicit
   protection for `...spread`, `obj.prop` and event keys like `p:`. My span-matching automation was
   wrong twice; the line-range method with an eyeball at the end was right.

## And the deeper point, which renaming does NOT fix

The gate could not tell a player from a prompt **because it was reading source text**. Better names
help a human read the code; they do not make a text-matching gate correct. §12j is the durable half:
a gate should assert on structure it can execute, not on what a local variable happens to be called.
