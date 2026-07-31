import {
  validateGenerateBoxedTextInput,
  validateGenerateBoxedTextOutput,
  type GenerateBoxedTextInput,
  type GenerateBoxedTextOutput,
} from "@lorebridge/shared/capabilities";
import { LoreBridgeCapabilityError, requireFoundryGm } from "./errors.js";
import { getLoreBridgeSettings } from "../settings.js";

export async function generateBoxedText(input: GenerateBoxedTextInput): Promise<GenerateBoxedTextOutput> {
  requireFoundryGm("generateBoxedText");

  const validated = validateGenerateBoxedTextInput(input);
  if (!validated.valid || !validated.value) {
    throw new LoreBridgeCapabilityError("INVALID_REQUEST", "Boxed text generation input is invalid.", { details: { validationErrors: validated.errors } });
  }

  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "LoreBridge backend URL is not configured.");
  }
  if (!settings.clientToken) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "This browser is not paired with the LoreBridge backend.");
  }

  const url = settings.backendUrl.endsWith("/")
    ? `${settings.backendUrl}v1/generate/boxed-text`
    : `${settings.backendUrl}/v1/generate/boxed-text`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.clientToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(validated.value),
    });
  } catch {
    throw new LoreBridgeCapabilityError("ADAPTER_UNAVAILABLE", "Could not reach the LoreBridge backend.", { retryable: true });
  }

  if (response.status === 503) {
    throw new LoreBridgeCapabilityError("CAPABILITY_UNAVAILABLE", "The LoreBridge backend has no AI provider configured.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new LoreBridgeCapabilityError("NOT_AUTHORIZED", "The backend rejected the pairing token.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body as { error?: { message?: string } }).error?.message ?? `Backend returned ${response.status}`;
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", message);
  }

  const raw = await response.json();
  const outputValidation = validateGenerateBoxedTextOutput(raw);
  if (!outputValidation.valid || !outputValidation.value) {
    throw new LoreBridgeCapabilityError("INTERNAL_ERROR", "The backend returned invalid generation output.", { details: { validationErrors: outputValidation.errors } });
  }

  return outputValidation.value;
}
