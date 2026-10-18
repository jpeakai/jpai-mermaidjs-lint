// Dominators by the iterative algorithm of Cooper, Harvey and Kennedy, "A
// Simple, Fast Dominance Algorithm" (2001). A node d dominates v when every
// path from the root to v passes through d; v's immediate dominator is the
// dominator closest to it. Run on the reversed graph from an exit, the same
// algorithm gives post-dominators. Successors are visited in the order given,
// so the result never depends on the order of a diagram's statements.

export type Successors = (id: string) => readonly string[];

// Each node in reverse postorder of a depth-first walk from the root.
const reversePostorder = (root: string, next: Successors): string[] => {
  const order: string[] = [];
  const seen = new Set<string>([root]);
  const stack: Array<{ id: string; at: number }> = [{ id: root, at: 0 }];
  while (stack.length > 0) {
    const top = stack.at(-1) as { id: string; at: number };
    const succ = next(top.id);
    const child = succ[top.at];
    top.at++;
    if (child === undefined) {
      order.push(top.id);
      stack.pop();
    } else if (!seen.has(child)) {
      seen.add(child);
      stack.push({ id: child, at: 0 });
    }
  }
  return order.reverse();
};

// The immediate dominator of every node the root reaches, the root mapped to
// itself. `prev` gives each node's predecessors.
export const immediateDominators = (root: string, next: Successors, prev: Successors): Map<string, string> => {
  const order = reversePostorder(root, next);
  const rank = new Map(order.map((id, i) => [id, i]));
  const idom = new Map<string, string>([[root, root]]);
  // Walks two fingers up the tree until they meet, the deeper one first.
  const intersect = (a: string, b: string): string => {
    let [x, y] = [a, b];
    while (x !== y) {
      while ((rank.get(x) ?? 0) > (rank.get(y) ?? 0)) x = idom.get(x) ?? root;
      while ((rank.get(y) ?? 0) > (rank.get(x) ?? 0)) y = idom.get(y) ?? root;
    }
    return x;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const b of order.slice(1)) {
      const done = prev(b).filter((p) => idom.has(p));
      const first = done[0];
      if (first === undefined) continue;
      const nearest = done.slice(1).reduce(intersect, first);
      if (idom.get(b) !== nearest) {
        idom.set(b, nearest);
        changed = true;
      }
    }
  }
  return idom;
};

// Whether d dominates v in the tree given: d is v or one of its ancestors.
export const dominates = (idom: ReadonlyMap<string, string>, d: string, v: string): boolean => {
  for (let x: string | undefined = v; x !== undefined; ) {
    if (x === d) return true;
    const up = idom.get(x);
    if (up === x) return false;
    x = up;
  }
  return false;
};
