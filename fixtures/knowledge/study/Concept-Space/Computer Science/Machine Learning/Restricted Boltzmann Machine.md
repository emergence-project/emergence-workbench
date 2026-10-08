An RBM is an energy-based model with visible units $v$ and hidden units $h$:

$$E(v,h) = -a^\top v - b^\top h - v^\top W h, \qquad p(v) \propto \sum_h e^{-E(v,h)}.$$

> [!tip] Use in graph coloring
> An RBM can score candidate colorings as a search heuristic — see [[Learned graph coloring]].
