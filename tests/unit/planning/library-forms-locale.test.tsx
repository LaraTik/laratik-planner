import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/app/w/[slug]/library/actions", () => ({
  archiveCampaignAction: vi.fn(),
  archivePillarAction: vi.fn(),
  archiveTemplateAction: vi.fn(),
  createCampaignAction: vi.fn(),
  createPillarAction: vi.fn(),
  createTemplateAction: vi.fn(),
}));

import { LocaleProvider } from "@/components/i18n/locale-provider";
import {
  ArchiveCampaignButton,
  NewCampaignForm,
  NewPillarForm,
  NewTemplateForm,
} from "@/app/(app)/app/w/[slug]/library/library-forms";

describe("planning library forms localization", () => {
  it("renders Arabic campaign form copy", () => {
    render(
      <LocaleProvider locale="ar">
        <NewCampaignForm slug="food-game" />
      </LocaleProvider>,
    );

    const campaignName = screen.getByPlaceholderText("اسم الحملة");
    expect(campaignName).toHaveAttribute("dir", "rtl");
    fireEvent.change(campaignName, { target: { value: "English campaign" } });
    expect(campaignName).toHaveAttribute("dir", "ltr");
    expect(screen.getByPlaceholderText("الهدف (اختياري)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إنشاء حملة" })).toBeInTheDocument();
    expect(screen.getByLabelText("تاريخ البدء")).toBeInTheDocument();
    expect(screen.getByLabelText("لون الغلاف")).toBeInTheDocument();
  });

  it("renders Arabic pillar, template, and archive copy", () => {
    render(
      <LocaleProvider locale="ar">
        <NewPillarForm slug="food-game" />
        <NewTemplateForm slug="food-game" />
        <ArchiveCampaignButton slug="food-game" id="campaign-1" />
      </LocaleProvider>,
    );

    expect(screen.getByPlaceholderText("اسم عمود المحتوى")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("الوصف (اختياري)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("اسم القالب")).toBeInTheDocument();
    const briefTemplate = screen.getByPlaceholderText("قالب الموجز (اختياري)");
    expect(briefTemplate).toHaveAttribute("dir", "rtl");
    fireEvent.change(briefTemplate, { target: { value: "English brief" } });
    expect(briefTemplate).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("button", { name: "إنشاء عمود" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إنشاء قالب" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أرشفة" })).toBeInTheDocument();
  });
});
