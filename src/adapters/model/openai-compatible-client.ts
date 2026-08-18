import type { GlobalModelConfig } from "../../core/model/config";
import { extractOpenAICompatibleText, parseLooseJson } from "../../core/model/openai-compatible";
import type { GroundVisualTargetRequest, VisualTargetCandidate } from "../../core/vision/vision";
import { parseVisualTargetCandidates } from "../../core/vision/vision";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export class OpenAICompatibleClient {
  constructor(
    private readonly config: GlobalModelConfig,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async groundVisualTarget(
    request: GroundVisualTargetRequest,
    screenshotDataUrl: string
  ): Promise<VisualTargetCandidate[]> {
    const model = this.config.roleModels.visionModel;
    if (!model || !this.config.capabilities.supportsVisionInput || !this.config.privacy.sendScreenshotsToRemoteVision) {
      return [];
    }

    const response = await this.fetchImpl(endpoint(this.config.provider.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...this.config.provider.defaultHeaders
      },
      body: JSON.stringify({
        model,
        response_format: this.config.capabilities.supportsJsonMode ? { type: "json_object" } : undefined,
        messages: [
          {
            role: "system",
            content:
              "Return only JSON with a candidates array. Each candidate must include label, roleGuess, boundingBox, nearbyText, confidence, screenshotRef, and reasoningSummary."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  requestId: request.requestId,
                  targetGoal: request.targetGoal,
                  pageIdentity: request.pageIdentity,
                  domCandidates: request.domCandidates,
                  nearbyText: request.nearbyText
                })
              },
              {
                type: "image_url",
                image_url: { url: screenshotDataUrl }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) return [];
    const json = (await response.json()) as ChatCompletionResponse;
    return parseVisualTargetCandidates(parseLooseJson(extractOpenAICompatibleText(json)));
  }
}
