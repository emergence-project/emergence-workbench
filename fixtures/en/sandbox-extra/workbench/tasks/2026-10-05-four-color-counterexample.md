---
title: Find a counterexample to the four-color Kempe argument
topic: four-color
agent: claude-code
created: 2026-10-05 10:30
state: paused
task: Look for a graph with at most 12 vertices where the Kempe chain argument fails with four colors.
end-condition: One counterexample, or none among 10,000 random graphs
result-at: 2026-10-05 16:02
conclusion: No counterexample among 10,000 random graphs with at most 12 vertices.
end-check: unknown
issues:
  - { text: The random sample hardly covers the boundary (near triangulations) }
judged:
  - { at: 2026-10-05 17:10, verdict: pause, seconds: 95 }
---
## 요약과 결론

No counterexample was found, but the sample does not cover the boundary, so it is too early to conclude.

## 근거

- 10,000 random planar graphs
