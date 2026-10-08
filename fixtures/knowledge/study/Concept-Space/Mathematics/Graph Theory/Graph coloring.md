---
tags: [math, graph-theory]
---
The chromatic number counts how few colors a graph needs so that adjacent vertices get different colors.

> [!definition] Chromatic number
> For a graph $G = (V, E)$,
> $$\chi(G) = \min\{k : \exists\, c : V \to [k],\ c(u) \ne c(v) \text{ for } uv \in E\}.$$

For planar graphs, $\chi(G) \le 5$ by Kempe chains and $\chi(G) \le 4$ in fact. See [[Four color theorem]].
