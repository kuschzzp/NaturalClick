let counter = 0;

function next(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createEventId(): string {
  return next("evt");
}

export function createStepId(): string {
  return next("step");
}

export function createTaskId(): string {
  return next("task");
}

export function createSessionId(): string {
  return next("session");
}
