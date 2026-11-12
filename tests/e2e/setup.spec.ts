import { test, expect } from "@playwright/test";
test("unconfigured app explains Supabase setup without inventing demo records", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Connect your workspace" }),
  ).toBeVisible();
  await expect(
    page.getByText("Create a Supabase project on the free plan."),
  ).toBeVisible();
});
