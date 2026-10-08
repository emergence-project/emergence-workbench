---
title: Graph coloring
aliases:
  - proper coloring
subject: Mathematics › Graph Theory
study: Concept-Space/Mathematics/Graph Theory/Graph coloring.md
checked:
  at: 2026-10-01
  hash: a1b2c3d4e5f60718
---
# Graph coloring

A proper coloring of $G$ with $k$ colors gives the two ends of every edge different colors, and the chromatic number is the least such $k$,

$$
\chi(G) = \min\{k : c : V \to [k] \text{ proper}\}, \qquad \abs{c(V)} \le k .
$$

It is monotone, $\chi(H) \le \chi(G)$ for subgraphs, and equals one exactly for graphs with no edges. Counting with the [[Euler formula]] bounds $\chi$ for planar graphs.
