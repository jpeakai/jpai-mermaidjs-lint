// A repair to the happy-dom window mermaid runs in. A browser's
// Node.prototype getters read each node's own name and text. happy-dom
// declares them on Node as empty and overrides them on each subclass, so a
// getter called through Node.prototype answers "" for every node. DOMPurify
// reads nodeName that way, saw every element unnamed and removed it, and so
// mermaid's sanitizer dropped a label's text before its first tag, all but
// the last line of a <br> label, and any label holding "<".

// The properties DOMPurify, or anything else, may read through Node.prototype.
const NODE_GETTERS = ["nodeName", "nodeValue", "textContent"] as const;

// Each getter, called on a node, runs the nearest override on the node's own
// class, as a browser's does, and Node's own getter only when none overrides it.
const dispatchToOverride = (proto: object, property: string): void => {
  const base = Object.getOwnPropertyDescriptor(proto, property);
  const baseGet = base?.get;
  if (!(base && baseGet)) return;
  Object.defineProperty(proto, property, {
    ...base,
    get(this: object): unknown {
      for (let p = Object.getPrototypeOf(this); p && p !== proto; p = Object.getPrototypeOf(p)) {
        const own = Object.getOwnPropertyDescriptor(p, property)?.get;
        if (own) return own.call(this);
      }
      return baseGet.call(this);
    },
  });
};

// Must run before mermaid loads: DOMPurify keeps the getters it finds then.
export const repairNodeGetters = (window: { Node: { prototype: object } }): void => {
  for (const property of NODE_GETTERS) dispatchToOverride(window.Node.prototype, property);
};
