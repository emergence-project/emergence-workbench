---
title: Numerically check the number of Kempe swaps
topic: coloring
agent: claude-code
created: 2026-10-05 09:10
state: result
task: On random planar graphs with at most 12 vertices, check numerically that coloring with Kempe swaps stays within five colors and the number of swaps stays within the bound n².
end-condition: Zero cases above the bound among 1000 random graphs, and three seeds agree
references: [workbench/notes/kempe-recoloring/note.md]
avoid: Do not edit the body of the research note
result-at: 2026-10-06 12:59
conclusion: All 1000 stayed within the bound; once there are more than 10 vertices the bound becomes loose, more than 4 times the actual count.
end-check: pass
ask:
  - Should this conclusion go into the research note "Recoloring along Kempe chains"?
  - { q: Where should it go?, options: [Conclusion section, New section, Appendix] }
issues:
  - { text: "Did not compute 13 vertices or more, so how loose the bound gets may depend on size", impact: Could change the numbers in the conclusion, next: 1 }
  - { text: Did not check whether the bound changes with a discharging order instead of Kempe swaps, impact: Separate from the conclusion, next: 2 }
next:
  - { task: Run the same comparison on 1000 random graphs with 13 vertices, end-condition: Error of the looseness ratio within ±10% }
  - { task: Run the same comparison with a discharging order, end-condition: Same conclusion for three seeds }
  - { task: Draft the conclusion section of the research note, end-condition: One draft file without editing the body }
outputs: [scripts/kempe_bound.py, data/kempe-bound/results.csv]
check: { machine: Numerical comparison passed (test_kempe_bound.py) · 2026-10-06 }
---
## 요약과 결론

In plain terms: planar graphs can always be colored within five colors using Kempe swaps, and the bound on the number of swaps holds, but as soon as there are a few more vertices the bound comes out much larger than the actual count. All three seeds agreed.

## 근거

- Generated 1000 random planar graphs and measured the number of colors $\chi(G)$ and the number of Kempe swaps.
- Zero cases exceeded the bound $n^2$.
- For $n > 10$, bound ÷ actual count was above 4.
