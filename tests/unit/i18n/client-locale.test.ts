import { describe, expect, it, beforeEach } from "vitest";

import { getClientT } from "@/lib/i18n/client-locale";

describe("getClientT", () => {
  beforeEach(() => {
    document.cookie = "";
    document.documentElement.lang = "ar";
  });

  it("uses the server-rendered html language when the locale cookie is unavailable", () => {
    const t = getClientT();

    expect(t("errors.appHeroTitle")).toBe("حدث خطأ غير متوقع");
  });
});
