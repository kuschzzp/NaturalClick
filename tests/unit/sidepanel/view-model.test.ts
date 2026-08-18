import { describe, expect, it } from "vitest";
import { buildWorkbenchViewModel } from "../../../src/sidepanel/view-model";

describe("workbench view model", () => {
  it("shows stop affordance while running and input is typed", () => {
    const vm = buildWorkbenchViewModel({
      mode: "conversation",
      activeTask: { status: "running", taskId: "task_1", title: "打开客户管理" },
      composerInput: "然后打开第一条客户",
      modelInstances: [],
      activeModel: undefined,
      timeline: [],
      pendingInstructions: []
    });

    expect(vm.topbar.running).toBe(true);
    expect(vm.composer.primaryAction).toBe("stop");
    expect(vm.composer.stopVisible).toBe(true);
  });

  it("shows send button while idle", () => {
    const vm = buildWorkbenchViewModel({
      mode: "conversation",
      activeTask: undefined,
      composerInput: "打开客户管理",
      modelInstances: [],
      activeModel: undefined,
      timeline: [],
      pendingInstructions: []
    });

    expect(vm.composer.primaryAction).toBe("send");
    expect(vm.composer.stopVisible).toBe(false);
  });

  it("formats the active model label for the composer picker", () => {
    const vm = buildWorkbenchViewModel({
      mode: "conversation",
      composerInput: "",
      modelInstances: [],
      activeModel: {
        instanceId: "inst_1",
        provider: "qwen",
        providerLabel: "Qwen",
        model: "qwen-max",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKeyRef: "secret:qwen",
        vision: false,
        tools: true,
        maxContextTokens: 32000
      },
      timeline: [],
      pendingInstructions: [{ id: "p1", text: "下一步" }]
    });

    expect(vm.composer.modelLabel).toBe("Qwen · qwen-max");
    expect(vm.composer.pendingCount).toBe(1);
    expect(vm.composer.modelConfigured).toBe(true);
  });
});
