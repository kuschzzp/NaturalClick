export interface MessageLike {
  role: string;
  content: string;
}

const STALE_INTERACTIVE_INDEX_PLACEHOLDER = "[stale interactive index elided; re-read page if needed]";

export function elideStaleObservations<T extends MessageLike>(history: T[]): T[] {
  let latestIndex = -1;
  history.forEach((message, index) => {
    if (message.content.includes("<interactive_index")) latestIndex = index;
  });
  return history.map((message, index) => {
    if (index === latestIndex) return message;
    return {
      ...message,
      content: message.content.replace(/<interactive_index[\s\S]*?<\/interactive_index>/g, STALE_INTERACTIVE_INDEX_PLACEHOLDER)
    };
  });
}
