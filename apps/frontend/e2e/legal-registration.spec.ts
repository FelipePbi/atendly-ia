import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const artifactsRoot = path.resolve(__dirname, "../../../artifacts/legal-documents");
const selectedProjects = new Set(["mobile-390", "desktop-1440"]);

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test("registration preserves draft through legal routes and records valid acceptance", async ({ page }, testInfo) => {
  test.skip(!selectedProjects.has(testInfo.project.name), "required 390x844 and 1440x900 coverage only");
  const password = "E2e-legal-123";
  const email = `legal-${testInfo.project.name}-${Date.now()}@example.com`;

  await page.goto("/cadastro");
  const termsCheckbox = page.getByRole("checkbox", {
    name: /Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade/i,
  });
  await expect(termsCheckbox).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeEnabled();
  const touchTarget = await page.locator(".auth-form__terms-target").boundingBox();
  expect(touchTarget?.width).toBeGreaterThanOrEqual(44);
  expect(touchTarget?.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.locator("#register-terms-error")).toHaveText("Você precisa aceitar os Termos de Uso para criar sua conta.");
  await expect(termsCheckbox).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(termsCheckbox).toBeFocused();
  expect(await termsCheckbox.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(password);

  await page.getByRole("link", { name: "Termos de Uso" }).click();
  await expect(page).toHaveURL(/\/termos-de-uso$/);
  await expect(page.getByRole("heading", { name: "Termos de Uso", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({
    path: path.join(artifactsRoot, testInfo.project.name, "termos-de-uso.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Voltar para criar conta" }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue(password);
  await expect(termsCheckbox).not.toBeChecked();

  await termsCheckbox.press("Space");
  await expect(termsCheckbox).toBeChecked();
  await page.getByRole("link", { name: "Política de Privacidade" }).click();
  await expect(page).toHaveURL(/\/politica-de-privacidade$/);
  await expect(page.getByRole("heading", { name: "Política de Privacidade", level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({
    path: path.join(artifactsRoot, testInfo.project.name, "politica-de-privacidade.png"),
    fullPage: true,
  });

  await page.goBack();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue(password);
  await expect(termsCheckbox).toBeChecked();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({
    path: path.join(artifactsRoot, testInfo.project.name, "cadastro-restaurado.png"),
    fullPage: true,
  });

  const persistentState = await page.evaluate(() => ({
    localStorage: { ...localStorage },
    sessionStorage: { ...sessionStorage },
    cookie: document.cookie,
    url: location.href,
  }));
  expect(JSON.stringify(persistentState)).not.toContain(password);

  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 10_000 });
});

test("direct legal access uses cadastro fallback and full reload clears passwords", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single direct-access and reload coverage");

  await page.goto("/termos-de-uso");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".legal-header")).toBeHidden();
  await expect(page.locator("#identificacao")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Voltar para criar conta" }).click();
  await expect(page).toHaveURL(/\/cadastro$/);

  await page.getByLabel("Email").fill("reload@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("Must-not-persist-123");
  await page.getByLabel("Confirmar senha").fill("Must-not-persist-123");
  await page.reload();

  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Confirmar senha")).toHaveValue("");
  const storage = await page.evaluate(() => JSON.stringify({
    localStorage: { ...localStorage },
    sessionStorage: { ...sessionStorage },
    cookie: document.cookie,
    url: location.href,
  }));
  expect(storage).not.toContain("Must-not-persist-123");
});
