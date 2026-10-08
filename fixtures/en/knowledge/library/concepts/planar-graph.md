---
title: Planar graph
aliases:
  - PG
  - plane graph
subject: Mathematics › Graph Theory
sources:
  - doeStructurePlanar2004
study: Concept-Space/Mathematics/Graph Theory/Planar graph.md
checked:
  at: 2026-10-04
  hash: ee242587833dc928
---
# Planar graph

A graph $G$ is **planar** when it can be drawn in the plane without crossing edges, and then $V - E + F = 2$ ([[Euler formula]]).

## Definition

$$
V - E + F = 2 \quad \text{for every connected plane graph} .
$$

## Properties

- A coloring of $G - v$ extends to $G$ by a [[Kempe recoloring]] around a vertex of low degree:
$$
c' = \Kempe{c}{1}{3}(c), \qquad \Col c' = \Col c.
$$
- List version: lists of five colors always suffice [@ipsumListColoringPlanar2015].
