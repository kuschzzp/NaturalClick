import { button, el } from "../components";
import type { WorkbenchViewModel } from "../view-model";

export interface WorkbenchComposerHandlers {
  onOpenSettings?: () => void;
  onOpenModelPicker?: () => void;
}

export function renderWorkbenchComposerMeta(vm: WorkbenchViewModel, handlers: WorkbenchComposerHandlers = {}): HTMLElement {
  const meta = el("div", "nc-composer-meta");
  const model = button("nc-model-picker-button", vm.composer.modelLabel, vm.composer.modelPickerLabel);
  model.dataset.action = "open-model-picker";
  model.addEventListener("click", () => (handlers.onOpenModelPicker ?? handlers.onOpenSettings)?.());
  meta.append(model);

  if (vm.composer.pendingCount > 0) {
    const pending = el("span", "nc-composer-pending", String(vm.composer.pendingCount));
    pending.setAttribute("aria-label", `${vm.composer.pendingCount} pending instructions`);
    meta.append(pending);
  }

  meta.dataset.primaryAction = vm.composer.primaryAction;
  meta.dataset.modelConfigured = String(vm.composer.modelConfigured);
  return meta;
}
