---
id: list-coloring
title: Extending to list coloring
status: blocked
parent: kempe-chains
blocked-reason: The Kempe swap step after the list condition is unchecked
resume-condition: After checking the original assumptions and the outer face
grounds: docs/note/appendices/a-kempe.tex
created: 2026-10-04
topics: [kempe, coloring]
kind: check
description: |-
  Check whether a graph is colorable when every vertex has a list of five allowed colors
  - Bound the effect of the Kempe swap $\Kempe{c}{1}{3}$ by the list size
---
> A fake example for development. It shows how to record why a note is blocked and when to reopen it.

## Goal and assumptions

Suppose we are checking whether the list coloring condition below can be used in the Kempe chain argument.
The assumptions on the graph, the definition of the lists $L(v)$ and the treatment of the outer face have not yet been compared with the original.

## Formula to check (existing example)

If $|L(v)| \ge 5$ for every vertex, there is a coloring $c$ such that

$$
c(v) \in L(v), \qquad c(u) \ne c(v) \ \text{for every edge } uv
$$

## Why it is blocked (formula, counterexample, reference location)

- Formula: the condition just above. The step from this condition to the Kempe swap needed for the recolored coloring is not written yet.
- Reference: the exact theorem number, page and assumptions in the original Ipsum–Dolor paper are not checked yet. Until then, it is not settled as grounds for applying it.
- Counterexample or calculation: none in this example. The dependence on the size of the outer face is not checked either.

## When to reopen

1. Write the bibliographic details, theorem number and page, assumptions and list definition of the original in this note.
2. Check that the graph to be colored satisfies those assumptions, and write the comparison needed after the formula above, line by line.
3. If the comparison fails, record the step and the reason, and decide again what to check next.

## What remains

- How much of the [[Planar graph]] condition list coloring needs
