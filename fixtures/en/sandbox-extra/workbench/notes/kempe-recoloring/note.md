## Goal

Rewrite in Markdown the argument that recolors the neighbours of a degree-five vertex $v$ along Kempe chains, extending a coloring of $G-v$ to a single [[Planar graph]] coloring $c'$ [@doe2004structure].

## Progress \label{sec: progress}

Splitting the graph $G_{ij}$ of vertices with colors $i$ and $j$ under the coloring $c$ of $G-v$ into components gives

$$
\begin{equation}
G_{ij} = \bigsqcup_k K_{ij}(w_k), \qquad K_{ij}(w_k) \cap K_{ij}(w_l) = \emptyset
\label{eq: decomposition}
\end{equation}
$$

and on a triangulation the degree sum splits into a share for each face.

$$
\begin{align}
\sum_v (\deg v - 6) &= 2E - 6V \label{eq: charge} \\
&= -12 - 2 \sum_f \left[ \deg f - 3 \right] \le -12, \qquad V - E + F = 2
\end{align}
$$

The recolored coloring can be written with a Kempe swap [@lorem1988sufficiency].^[The swap is $s_{ij}(c)(u) = \{i, j\} \setminus \{c(u)\}$ for $u \in K_{ij}(w)$ and $c(u)$ elsewhere.]
<!-- Notes left while moving from the old LaTeX note are hidden like this -->

![The neighbours $v_1$, $v_3$ and two Kempe chains. It shows $K_{13}$ and $K_{24}$ of Eq. \eqref{eq: decomposition}. \label{fig: parts}](parts.svg)

**Proof.** If $v_3 \notin K_{13}(v_1)$, only the component of Eq. \eqref{eq: decomposition} that contains $v_1$ (Figure \ref{fig: parts}) needs to be swapped. ∎

Seen with the map figure from the shared figure library:

![[Three-country map|240]]

## Open problems

- The four-color case (when $K_{13}$ and $K_{24}$ are tangled)
- Relation to the [[Vertex splitting]] method
