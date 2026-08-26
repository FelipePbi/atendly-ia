import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { CURRENT_LEGAL_VERSIONS } from "../src/config/legal-versions";

const artifactsRoot = path.resolve(__dirname, "../../../artifacts/whatsapp-pairing");

async function prepareOnboarding(page: Page) {
  const email = `pairing-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = "E2e-pairing-123";

  const register = await page.request.post("/api/auth/register", {
    data: {
      email,
      password,
      confirmPassword: password,
      termsAccepted: true,
      ...CURRENT_LEGAL_VERSIONS
    }
  });
  expect(register.ok(), await register.text()).toBe(true);
  const sessionCookie = register.headers()["set-cookie"]?.split(";", 1)[0];
  expect(sessionCookie).toBeTruthy();
  const separator = sessionCookie?.indexOf("=") ?? -1;
  await page.context().addCookies([
    {
      name: sessionCookie?.slice(0, separator) ?? "atendly_session",
      value: sessionCookie?.slice(separator + 1) ?? "",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);

  const profile = await page.request.patch("/api/onboarding/profile", {
    data: {
      fullName: "Marina Oliveira",
      birthDate: "1992-05-14",
      sex: "FEMALE",
      businessName: "Studio Marina"
    }
  });
  expect(profile.ok(), await profile.text()).toBe(true);

  const settings = await page.request.patch("/api/virtual-attendant/settings", {
    data: {
      identityMode: "PROFESSIONAL",
      professionalSex: "FEMALE",
      personaType: "WARM",
      activationMode: "ALWAYS",
      virtualAttendantOnboardingCompleted: true
    }
  });
  expect(settings.ok(), await settings.text()).toBe(true);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__test/reset");
});

test("mobile generates, copies, polls and completes automatically", async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile flow");
  await prepareOnboarding(page);
  await page.goto("/onboarding");

  await expect(page.getByRole("heading", { name: "Conecte seu WhatsApp", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar código de conexão" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "QR Code" })).toBeHidden();
  await expect(page.locator("body")).toHaveCSS("overflow-x", "visible");
  await page.screenshot({
    path: path.join(artifactsRoot, "mobile", `${testInfo.project.name}-initial.png`),
    fullPage: true
  });

  await page.getByLabel("Telefone com DDD").fill("11999999999");
  await page.getByRole("button", { name: "Gerar código de conexão" }).click();
  await expect(page.getByRole("button", { name: "Gerando código..." })).toBeDisabled();
  await page.screenshot({
    path: path.join(artifactsRoot, "mobile", `${testInfo.project.name}-generating.png`),
    fullPage: true
  });
  await expect(page.getByText("1234 5678", { exact: true })).toBeVisible();
  await expect(page.getByText("Aguardando conexão...", { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(artifactsRoot, "mobile", `${testInfo.project.name}-waiting.png`),
    fullPage: true
  });

  await page.getByRole("button", { name: "Copiar código" }).click();
  await expect(page.getByRole("button", { name: "Código copiado" })).toBeVisible();

  await request.post("http://127.0.0.1:18080/__test/connect");
  await expect(page.getByText("WhatsApp conectado com sucesso")).toBeVisible({ timeout: 8_000 });
  await page.screenshot({
    path: path.join(artifactsRoot, "mobile", `${testInfo.project.name}-connected.png`),
    fullPage: true
  });
  await expect(page).toHaveURL(/\/chat$/, { timeout: 8_000 });
});

test("mobile reload preserves phone and pending instance", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single mobile reload coverage");
  await prepareOnboarding(page);
  await page.goto("/onboarding");
  await page.getByLabel("Telefone com DDD").fill("11999999999");
  await page.getByRole("button", { name: "Gerar código de conexão" }).click();
  await expect(page.getByText("1234 5678", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Telefone com DDD")).toHaveValue("(11) 99999-9999");
  await expect(page.getByRole("button", { name: "Gerar código de conexão" })).toBeVisible();
  const stats = await (await request.get("http://127.0.0.1:18080/__test/stats")).json();
  expect(stats.instances).toBe(1);
});

test("mobile expires and regenerates the code", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single mobile expiration coverage");
  await page.clock.install();
  await prepareOnboarding(page);
  await page.goto("/onboarding");
  await page.getByLabel("Telefone com DDD").fill("11999999999");
  await page.getByRole("button", { name: "Gerar código de conexão" }).click();
  await expect(page.getByText("1234 5678", { exact: true })).toBeVisible();

  await page.clock.fastForward(161_000);
  await expect(page.getByText("Código expirado")).toBeVisible();
  await page.screenshot({
    path: path.join(artifactsRoot, "mobile", `${testInfo.project.name}-expired.png`),
    fullPage: true
  });

  await page.clock.setSystemTime(new Date());
  await page.getByRole("button", { name: "Gerar novo código" }).click();
  await expect(page.getByText("1234 5678", { exact: true })).toBeVisible();
});

test("mobile shows safe generation error and supports QR alternative", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single mobile error coverage");
  await prepareOnboarding(page);
  await page.goto("/onboarding");
  await page.getByLabel("Telefone com DDD").fill("11999999999");
  await request.post("http://127.0.0.1:18080/__test/pair-failure");
  await page.getByRole("button", { name: "Gerar código de conexão" }).click();
  await expect(page.getByText("Algo deu errado")).toBeVisible();
  await expect(page.getByText("Não foi possível gerar o código de conexão.")).toBeVisible();
  await page.screenshot({
    path: path.join(artifactsRoot, "mobile", `${testInfo.project.name}-error.png`),
    fullPage: true
  });

  await page.getByRole("button", { name: "Usar QR Code em outro dispositivo" }).click();
  await expect(page.getByAltText("QR Code para conectar WhatsApp").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar com código" })).toBeVisible();
});

test("desktop and tablet-width projects keep the QR flow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "desktop flow");
  await prepareOnboarding(page);
  await page.goto("/onboarding");

  await expect(page.getByRole("heading", { name: "Conecte seu WhatsApp.", level: 1 })).toBeVisible();
  await expect(page.getByAltText("QR Code para conectar WhatsApp")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: "Gerar novo QR Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar código de conexão" })).toBeHidden();
  await page.screenshot({
    path: path.join(artifactsRoot, "desktop", `${testInfo.project.name}-after.png`),
    fullPage: true
  });
});
