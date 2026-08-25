import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logError, logWarn, sanitizeLogContext } from "@/lib/observability/logger";

describe("sanitizeLogContext", () => {
  it("redacts authorization, cookie, secret, token, password, api_key, body, content, prompt, brief", () => {
    const input = {
      authorization: "Bearer secret-token",
      cookie: "session=abc",
      secret: "shh",
      token: "abc.def",
      password: "hunter2",
      apiKey: "ak_123",
      api_key: "ak_456",
      body: "raw body",
      content: "raw content",
      prompt: "raw prompt",
      brief: "raw brief",
      username: "alice",
    };
    const out = sanitizeLogContext(input) as Record<string, unknown>;
    expect(out["authorization"]).toBe("[redacted]");
    expect(out["cookie"]).toBe("[redacted]");
    expect(out["secret"]).toBe("[redacted]");
    expect(out["token"]).toBe("[redacted]");
    expect(out["password"]).toBe("[redacted]");
    expect(out["apiKey"]).toBe("[redacted]");
    expect(out["api_key"]).toBe("[redacted]");
    expect(out["body"]).toBe("[redacted]");
    expect(out["content"]).toBe("[redacted]");
    expect(out["prompt"]).toBe("[redacted]");
    expect(out["brief"]).toBe("[redacted]");
    expect(out["username"]).toBe("alice");
  });

  it("serializes Error objects as { name, message: '[redacted]' }", () => {
    const err = new Error("secret value");
    err.name = "CustomError";
    const out = sanitizeLogContext(err) as Record<string, unknown>;
    expect(out["name"]).toBe("CustomError");
    expect(out["message"]).toBe("[redacted]");
  });

  it("recursively sanitizes arrays and nested objects", () => {
    const input = {
      list: [{ token: "secret", value: 1 }, { value: 2 }],
      nested: {
        apiKey: "k",
        safe: "ok",
      },
    };
    const out = sanitizeLogContext(input) as {
      list: Array<Record<string, unknown>>;
      nested: Record<string, unknown>;
    };
    expect(out.list[0]?.["token"]).toBe("[redacted]");
    expect(out.list[0]?.["value"]).toBe(1);
    expect(out.nested["apiKey"]).toBe("[redacted]");
    expect(out.nested["safe"]).toBe("ok");
  });

  it("passes primitives through unchanged", () => {
    expect(sanitizeLogContext("hello")).toBe("hello");
    expect(sanitizeLogContext(42)).toBe(42);
    expect(sanitizeLogContext(true)).toBe(true);
    expect(sanitizeLogContext(null)).toBe(null);
    expect(sanitizeLogContext(undefined)).toBe(undefined);
  });
});

describe("logError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a JSON object with level=error, event, and timestamp", () => {
    logError("test.event", { foo: "bar" });
    expect(console.error).toHaveBeenCalledTimes(1);
    const [line] = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = JSON.parse(line as string);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("test.event");
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.foo).toBe("bar");
  });

  it("redacts sensitive fields in the logged context", () => {
    logError("auth.attempt", { email: "x", password: "hunter2" });
    const [line] = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = JSON.parse(line as string);
    expect(parsed.email).toBe("x");
    expect(parsed.password).toBe("[redacted]");
  });

  it("works when called with no context", () => {
    logError("event-only");
    const [line] = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = JSON.parse(line as string);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("event-only");
  });
});

describe("logWarn", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a sanitized JSON warning", () => {
    logWarn("platform_access.denied", {
      actorId: "user-1",
      permission: "platform.agency.update",
      token: "must-not-leak",
    });

    expect(console.warn).toHaveBeenCalledTimes(1);
    const [line] = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      level: "warn",
      event: "platform_access.denied",
      actorId: "user-1",
      permission: "platform.agency.update",
      token: "[redacted]",
    });
  });
});
