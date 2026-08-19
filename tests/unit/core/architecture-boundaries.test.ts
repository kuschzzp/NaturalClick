import { describe, expect, it } from "vitest";
import { assertNever, isSerializableRecord } from "../../../src/core/architecture/serialization";
import { isRuntimeAbortReason, runtimeAbortReasons } from "../../../src/core/architecture/boundaries";
import {
  MODEL_CONFIG_MESSAGE_TYPES,
  PAGE_ATLAS_MESSAGE_TYPES,
  SESSION_LIFECYCLE_MESSAGE_TYPES,
  TOOL_EXECUTION_MESSAGE_TYPES
} from "../../../src/shared/protocol";

describe("architecture serialization helpers", () => {
  it("accepts JSON-serializable records used across adapter boundaries", () => {
    expect(isSerializableRecord({ type: "x", count: 1, nested: { ok: true }, list: ["a"] })).toBe(true);
  });

  it("rejects functions at adapter boundaries", () => {
    expect(isSerializableRecord({ handler: () => undefined })).toBe(false);
  });

  it("rejects values that cannot be represented as safe JSON messages", () => {
    expect(isSerializableRecord({ count: Number.NaN })).toBe(false);
    expect(isSerializableRecord({ stamp: new Date() })).toBe(false);
    expect(isSerializableRecord({ missing: undefined })).toBe(false);
  });

  it("keeps assertNever as an exhaustive-switch guard", () => {
    expect(() => assertNever("unexpected" as never)).toThrow("Unhandled case: unexpected");
  });
});

describe("architecture boundary discriminators", () => {
  it("keeps runtime abort reasons explicit", () => {
    expect(runtimeAbortReasons).toContain("user_stop");
    expect(isRuntimeAbortReason("service_worker_restart")).toBe(true);
    expect(isRuntimeAbortReason("unknown")).toBe(false);
  });

  it("groups shared protocol messages by bounded context", () => {
    expect(MODEL_CONFIG_MESSAGE_TYPES).toEqual([
      "GET_MODEL_CONFIG",
      "SAVE_MODEL_INSTANCE",
      "DELETE_MODEL_INSTANCE",
      "SET_ACTIVE_MODEL_SELECTION",
      "SET_ROLE_MODEL_SELECTION",
      "CLEAR_ROLE_MODEL_SELECTION",
      "TEST_MODEL_INSTANCE"
    ]);
    expect(PAGE_ATLAS_MESSAGE_TYPES).toEqual(["READ_PAGE_ATLAS", "FIND_PAGE_TARGET", "READ_PAGE_TARGET"]);
    expect(TOOL_EXECUTION_MESSAGE_TYPES).toEqual(["GET_TOOL_DEFINITIONS", "EXECUTE_TOOL"]);
    expect(SESSION_LIFECYCLE_MESSAGE_TYPES).toEqual(["GET_SESSION_STATE", "NEW_SESSION", "RETRY_TASK", "RESUME_TASK", "STOP_TASK"]);
  });
});
