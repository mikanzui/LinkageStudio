# Linkage Studio Rebuild Work

For rebuild, compatibility, UI or physics work, begin with:

1. `docs/rebuild/MASTER-PLAN.md`
2. `docs/rebuild/progress-tracker.md`
3. Relevant rows in `docs/rebuild/visual-usability-comparison.md`
4. The active stage in `docs/rebuild/validation-gates.md`

Preserve the existing workspace and uncommitted compatibility experiments. Use an
isolated candidate branch/check-out for rebuild implementation; pinned upstream is
Huggabiz v0.12.3 at `3dfe10512e105f863a582ce5cc4b3bb8a2006306`.

Update task status and evidence as work proceeds. A passing build or unit test is
not proof of a working UI drag, correct physics, complete persistence or iPad
compatibility. Keep visual/usability comparisons linked to each relevant change.
Record missing browser/device tests as unverified. Follow the user's current scope;
preparation does not itself authorize publication or replacing the original app.
Codex owns verification and gate acceptance; do not make the user the routine QA
runner or require their sign-off to progress. Apply requirements at their assigned
gate. Physical iPad evidence cannot be claimed from emulation, but its absence
does not block the accepted G0 baseline or G1 document-layer implementation.
The user additionally requested continuous autonomous progression until completion
or a genuine blocker, with iPad functionality verified through code. Run code,
WebKit, touch/viewport and cancellation regressions proactively; unavailable physical
hardware is a disclosed qualification limit, not a routine gate-unlock request.

The user selected selective multi-agent execution. Read
`docs/rebuild/multi-agent-execution.md` before delegating. Use one lead and at most
two focused workers when independent work exists. The lead owns shared contracts,
integration, the progress tracker and gate acceptance. Give workers disjoint file
ownership and bounded briefs; default to one agent for tightly coupled work. Do not
spawn workers merely to update planning documents. Record actual time/usage when
available; mark unavailable usage unknown and never claim unmeasured cost savings.
