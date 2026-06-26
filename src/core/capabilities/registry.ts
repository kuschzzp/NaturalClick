export const initialCapabilities = [
  "BrowserBasicCapability",
  "PageReadingCapability",
  "FormBasicCapability",
  "FeedbackCapability",
  "RecoveryBasicCapability",
  "VisionCapability"
] as const;

export type CapabilityId = (typeof initialCapabilities)[number];
