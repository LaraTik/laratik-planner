import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const privacySource = readFileSync(resolve(process.cwd(), "src/app/privacy/page.tsx"), "utf8");

describe("privacy policy Community & Inbox contract", () => {
  it("names the Facebook community data and permission boundary", () => {
    expect(privacySource).toContain("Community & Inbox data");
    expect(privacySource).toContain("pages_messaging");
    expect(privacySource).toContain("Facebook Page private-message conversations and messages");
    expect(privacySource).toContain("analytics connection does not automatically grant");
  });

  it("documents the workspace and safety boundaries", () => {
    expect(privacySource).toContain("workspace-scoped");
    expect(privacySource).toContain("Public replies,");
    expect(privacySource).toContain("private replies, and internal staff notes");
    expect(privacySource).toContain("defaults to 90 days");
    expect(privacySource).toContain("The Test Lab does not send a message to Meta");
  });

  it("keeps optional MiniMax processing conditional and preserves existing processors", () => {
    expect(privacySource).toContain("Optional Community AI / Test Lab processing");
    expect(privacySource).toContain("MiniMax");
    expect(privacySource).toContain("only when an agency has");
    expect(privacySource).toContain("enabled Community AI");
    expect(privacySource).toContain("Hetzner Online GmbH");
    expect(privacySource).toContain("Mailcow / self-hosted SMTP");
    expect(privacySource).toContain("Sentry (self-hosted, Germany region)");
    expect(privacySource).toContain("Mohamad Nezam");
    expect(privacySource).toContain("trading as LaraTik");
  });
});
