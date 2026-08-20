import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests for scripts/vps/preflight.sh.
 *
 * The preflight reads PREFLIGHT_ENV_FILE (a .env file) and checks that
 * at least one authentication provider is complete. It is the structural
 * guard that prevents a deploy from rolling out a container with no
 * configured sign-in method — which is the failure mode behind
 * `Sign-in is not configured correctly. Please contact support if this
 * keeps happening.` surfacing on /signin.
 *
 * The script is bash; we run it as a subprocess and assert on exit
 * code + stdout/stderr. Each test creates a temp .env file with a
 * different provider combination, sets PREFLIGHT_ENV_FILE, and runs
 * the script. No docker required.
 */

const PREFLIGHT = join(process.cwd(), "scripts/vps/preflight.sh");

function runPreflight(envContent: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "preflight-"));
  const envFile = join(dir, ".env");
  writeFileSync(envFile, envContent);
  const result = spawnSync("bash", [PREFLIGHT], {
    env: {
      ...process.env,
      PREFLIGHT_ENV_FILE: envFile,
    },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("scripts/vps/preflight.sh", () => {
  describe("passes when at least one provider is complete", () => {
    it("accepts Google OAuth only", () => {
      const { status, stdout } = runPreflight(
        "GOOGLE_CLIENT_ID=abc.apps.googleusercontent.com\n" + "GOOGLE_CLIENT_SECRET=GOCSPX-xyz\n",
      );
      expect(status).toBe(0);
      expect(stdout).toMatch(/Preflight OK/);
      expect(stdout).toMatch(/Google/);
      expect(stdout).not.toMatch(/SMTP/);
    });

    it("accepts SMTP only", () => {
      const { status, stdout } = runPreflight(
        'SMTP_HOST="mail.laratik.com"\n' +
          'SMTP_USER="no-reply@laratik.com"\n' +
          'SMTP_PASSWORD="hunter2"\n' +
          'SMTP_FROM="LaraTik <no-reply@laratik.com>"\n',
      );
      expect(status).toBe(0);
      expect(stdout).toMatch(/Preflight OK/);
      expect(stdout).toMatch(/SMTP/);
      expect(stdout).not.toMatch(/Google/);
    });

    it("accepts both providers", () => {
      const { status, stdout } = runPreflight(
        "GOOGLE_CLIENT_ID=abc\nGOOGLE_CLIENT_SECRET=xyz\n" +
          "SMTP_HOST=mail.laratik.com\nSMTP_USER=hi\nSMTP_PASSWORD=hp\nSMTP_FROM=hi@laratik.com\n",
      );
      expect(status).toBe(0);
      expect(stdout).toMatch(/Preflight OK/);
      expect(stdout).toMatch(/Google/);
      expect(stdout).toMatch(/SMTP/);
    });

    it("ignores comments and blank lines", () => {
      const { status, stdout } = runPreflight(
        "# production auth block\n" +
          "\n" +
          "GOOGLE_CLIENT_ID=abc\n" +
          "# secret below\n" +
          "GOOGLE_CLIENT_SECRET=xyz\n" +
          "\n",
      );
      expect(status).toBe(0);
      expect(stdout).toMatch(/Preflight OK/);
    });

    it("strips surrounding single and double quotes from values", () => {
      const { status } = runPreflight("GOOGLE_CLIENT_ID='abc'\n" + 'GOOGLE_CLIENT_SECRET="xyz"\n');
      expect(status).toBe(0);
    });
  });

  describe("fails when no provider is complete", () => {
    it("rejects an empty .env", () => {
      const { status, stderr } = runPreflight("");
      expect(status).toBe(1);
      expect(stderr).toMatch(/No complete authentication provider/);
      expect(stderr).toMatch(/GOOGLE_CLIENT_ID/);
      expect(stderr).toMatch(/SMTP_HOST/);
    });

    it("rejects a .env with no auth vars at all", () => {
      const { status, stderr } = runPreflight("NODE_ENV=production\nDATABASE_URL=postgres://x\n");
      expect(status).toBe(1);
      expect(stderr).toMatch(/No complete authentication provider/);
    });

    it("rejects Google with only the client id", () => {
      const { status, stderr } = runPreflight("GOOGLE_CLIENT_ID=abc\nGOOGLE_CLIENT_SECRET=\n");
      expect(status).toBe(1);
      expect(stderr).toMatch(/No complete authentication provider/);
    });

    it("rejects Google with only the client secret", () => {
      const { status, stderr } = runPreflight("GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=xyz\n");
      expect(status).toBe(1);
      expect(stderr).toMatch(/No complete authentication provider/);
    });

    it("rejects SMTP missing password", () => {
      const { status, stderr } = runPreflight(
        "SMTP_HOST=mail.laratik.com\nSMTP_USER=hi\nSMTP_PASSWORD=\nSMTP_FROM=hi@laratik.com\n",
      );
      expect(status).toBe(1);
      expect(stderr).toMatch(/No complete authentication provider/);
    });

    it("rejects SMTP missing from", () => {
      const { status, stderr } = runPreflight(
        "SMTP_HOST=mail.laratik.com\nSMTP_USER=hi\nSMTP_PASSWORD=hp\n",
      );
      expect(status).toBe(1);
      expect(stderr).toMatch(/No complete authentication provider/);
    });

    it("points the operator at the env_file + restart step on failure", () => {
      const { status, stderr } = runPreflight("");
      expect(status).toBe(1);
      expect(stderr).toMatch(/docker compose up -d --no-deps app/);
    });
  });

  describe("errors (not configuration failures) when the .env is unreachable", () => {
    it("returns exit 2 when PREFLIGHT_ENV_FILE points to a missing file", () => {
      const result = spawnSync("bash", [PREFLIGHT], {
        env: {
          ...process.env,
          PREFLIGHT_ENV_FILE: "/tmp/does-not-exist-12345.env",
        },
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/does not exist/);
    });
  });
});
