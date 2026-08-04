import assert from "node:assert/strict";
import test from "node:test";
import { ProviderService } from "./provider.js";

test("ProviderService reads no provider when env has no API keys", () => {
  const service = new ProviderService({});
  assert.equal(service.provider, "none");
  assert.equal(service.enabled, false);
  assert.equal(service.apiKey, undefined);
});

test("ProviderService reads Anthropic provider when ANTHROPIC_API_KEY is set", () => {
  const service = new ProviderService({ ANTHROPIC_API_KEY: "sk-ant-test" });
  assert.equal(service.provider, "anthropic");
  assert.equal(service.enabled, true);
  assert.equal(service.apiKey, "sk-ant-test");
});

test("ProviderService reads OpenAI provider when only OPENAI_API_KEY is set", () => {
  const service = new ProviderService({ OPENAI_API_KEY: "sk-openai-test" });
  assert.equal(service.provider, "openai");
  assert.equal(service.enabled, true);
  assert.equal(service.apiKey, "sk-openai-test");
  assert.equal(service.baseUrl, undefined);
  assert.equal(service.model, undefined);
});

test("ProviderService reads OpenAI provider with custom base URL", () => {
  const service = new ProviderService({
    OPENAI_API_KEY: "sk-local",
    OPENAI_BASE_URL: "http://localhost:1234/v1",
  });
  assert.equal(service.provider, "openai");
  assert.equal(service.apiKey, "sk-local");
  assert.equal(service.baseUrl, "http://localhost:1234/v1");
  assert.equal(service.model, undefined);
});

test("ProviderService reads OpenAI provider with custom model", () => {
  const service = new ProviderService({
    OPENAI_API_KEY: "sk-openai-test",
    OPENAI_MODEL: "gpt-4o",
  });
  assert.equal(service.provider, "openai");
  assert.equal(service.model, "gpt-4o");
});

test("ProviderService reads OpenAI provider with base URL and model", () => {
  const service = new ProviderService({
    OPENAI_API_KEY: "lm-studio",
    OPENAI_BASE_URL: "http://localhost:1234/v1",
    OPENAI_MODEL: "mistral-7b",
  });
  assert.equal(service.provider, "openai");
  assert.equal(service.baseUrl, "http://localhost:1234/v1");
  assert.equal(service.model, "mistral-7b");
});

test("ProviderService reads Ollama provider when OLLAMA_BASE_URL is set", () => {
  const service = new ProviderService({ OLLAMA_BASE_URL: "http://localhost:11434" });
  assert.equal(service.provider, "ollama");
  assert.equal(service.enabled, true);
  assert.equal(service.apiKey, undefined);
  assert.equal(service.baseUrl, "http://localhost:11434");
  assert.equal(service.model, "llama3.2");
});

test("ProviderService reads Ollama provider with custom model", () => {
  const service = new ProviderService({
    OLLAMA_BASE_URL: "http://localhost:11434",
    OLLAMA_MODEL: "mistral",
  });
  assert.equal(service.provider, "ollama");
  assert.equal(service.model, "mistral");
});

test("ProviderService trims whitespace from OLLAMA_BASE_URL", () => {
  const service = new ProviderService({ OLLAMA_BASE_URL: "  http://localhost:11434  " });
  assert.equal(service.provider, "ollama");
  assert.equal(service.baseUrl, "http://localhost:11434");
});

test("ProviderService ignores blank OLLAMA_BASE_URL", () => {
  const service = new ProviderService({ OLLAMA_BASE_URL: "   " });
  assert.equal(service.provider, "none");
  assert.equal(service.enabled, false);
});

test("ProviderService prefers Anthropic when both keys are set", () => {
  const service = new ProviderService({ ANTHROPIC_API_KEY: "sk-ant-test", OPENAI_API_KEY: "sk-openai-test" });
  assert.equal(service.provider, "anthropic");
});

test("ProviderService prefers Anthropic over Ollama", () => {
  const service = new ProviderService({
    ANTHROPIC_API_KEY: "sk-ant-test",
    OLLAMA_BASE_URL: "http://localhost:11434",
  });
  assert.equal(service.provider, "anthropic");
});

test("ProviderService prefers OpenAI over Ollama", () => {
  const service = new ProviderService({
    OPENAI_API_KEY: "sk-openai-test",
    OLLAMA_BASE_URL: "http://localhost:11434",
  });
  assert.equal(service.provider, "openai");
});

test("ProviderService trims whitespace from API keys", () => {
  const service = new ProviderService({ ANTHROPIC_API_KEY: "  sk-ant-test  " });
  assert.equal(service.provider, "anthropic");
  assert.equal(service.apiKey, "sk-ant-test");
});

test("ProviderService ignores blank API keys", () => {
  const service = new ProviderService({ ANTHROPIC_API_KEY: "   " });
  assert.equal(service.provider, "none");
  assert.equal(service.enabled, false);
});

test("ProviderService.validate returns false when no provider is configured", async () => {
  const service = new ProviderService({});
  assert.equal(await service.validate(), false);
});

test("ProviderService.status returns correct shape", () => {
  const service = new ProviderService({ ANTHROPIC_API_KEY: "sk-ant-test" });
  const status = service.status(true);
  assert.equal(status.provider, "anthropic");
  assert.equal(status.enabled, true);
  assert.equal(status.healthy, true);
});

test("ProviderService.status with null healthy for disabled provider", () => {
  const service = new ProviderService({});
  const status = service.status(null);
  assert.equal(status.provider, "none");
  assert.equal(status.enabled, false);
  assert.equal(status.healthy, null);
});

test("ProviderService never exposes apiKey via status()", () => {
  const service = new ProviderService({ ANTHROPIC_API_KEY: "sk-ant-test" });
  const status = service.status(true) as unknown as Record<string, unknown>;
  assert.equal(status["apiKey"], undefined);
  assert.equal(status["key"], undefined);
  assert.equal(Object.keys(status).sort().join(","), "enabled,healthy,provider");
});

test("ProviderService.status for Ollama returns correct provider name", () => {
  const service = new ProviderService({ OLLAMA_BASE_URL: "http://localhost:11434" });
  const status = service.status(null);
  assert.equal(status.provider, "ollama");
  assert.equal(status.enabled, true);
});
