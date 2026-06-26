export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, label: string, ariaLabel = label): HTMLButtonElement {
  const node = el("button", className, label);
  node.type = "button";
  node.setAttribute("aria-label", ariaLabel);
  return node;
}

export function badge(text: string, tone = "neutral"): HTMLElement {
  return el("span", `nc-badge nc-badge--${tone}`, text);
}

export function textInput(label: string, value = "", placeholder = ""): HTMLLabelElement {
  const wrapper = el("label", "nc-field");
  wrapper.append(el("span", "nc-field__label", label));
  const input = el("input", "nc-input") as HTMLInputElement;
  input.value = value;
  input.placeholder = placeholder;
  wrapper.append(input);
  return wrapper;
}
