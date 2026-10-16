// Tiny DOM builder for the editor UI. Text goes in as text nodes, never markup, so user text
// (client names, labels) can't inject HTML (TDD §8: no innerHTML with data).

type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    node.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children) if (c) node.append(c)
  return node
}
