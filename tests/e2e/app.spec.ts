import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const origin = "http://localhost:3017";
async function openLibrary(page: Page) {
  await page.goto("/");
  await expect(
    page.locator('input[type="password"], input[name="username"]'),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /登录/ })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "我的资源库", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".resource-card")).toHaveCount(27);
}
test("desktop library, exact clipboard, filters, fallback and mobile layout", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openLibrary(page);
  await expect(page).toHaveTitle(/Color Atlas/);
  await page.screenshot({
    path: "/tmp/color-atlas-qa/desktop.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "复制 #F7FAFC", exact: true })
    .first()
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "#F7FAFC",
  );
  await page.getByLabel("全局复制格式").selectOption("rgb");
  const swatch = page.locator(".swatch").first();
  const shown = await swatch.locator("code").innerText();
  await swatch.getByRole("button").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
  await page.getByLabel("全局复制格式").selectOption("auto");
  await page.getByLabel("搜索资源").fill("教育");
  await page.getByLabel("搜索资源").press("Enter");
  await expect(
    page.getByRole("link", { name: "阳光教育", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/q=/);
  await page.reload();
  await expect(page.getByLabel("搜索资源")).toHaveValue("教育");
  await page.goto("/library");
  await expect(page.locator(".resource-card")).toHaveCount(27);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("Denied")) },
      configurable: true,
    });
  });
  await page
    .getByRole("button", { name: "复制 #F7FAFC", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("手动复制");
  await expect(page.getByLabel("待复制内容")).toHaveValue("#F7FAFC");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/color-atlas-qa/mobile.png",
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("打开导航").click();
  await expect(page.getByRole("dialog")).toContainText("导入与导出");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(errors).toEqual([]);
});
test("create, reorder, reload, publish, private-field isolation, revoke and restore", async ({
  page,
  browser,
}) => {
  await openLibrary(page);
  const title = "QA palette " + Date.now();
  let id = "";
  try {
    await page.getByRole("button", { name: "新增资源", exact: true }).click();
    await page
      .getByLabel("输入颜色", { exact: true })
      .fill("rgba(255,0,0,0.5); #287F83");
    await page.getByRole("button", { name: "加入颜色列表" }).click();
    await page.getByLabel("颜色 1 的角色").fill("accent");
    await page.getByRole("button", { name: "后移颜色 1", exact: true }).click();
    await page.getByLabel("名称", { exact: true }).fill(title);
    await page.getByLabel("私有笔记").fill("PRIVATE NOTE MUST NEVER LEAK");
    await page
      .getByRole("button", { name: "保存到资源库", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    id = page.url().split("/").pop()!;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const saved = await (await page.request.get(`/api/resources/${id}`)).json();
    expect(saved.colors[0].input).toBe("#287F83");
    expect(saved.colors[1].value.alpha).toBe(0.5);
    await page.getByRole("button", { name: "编辑资源", exact: true }).click();
    await page.getByLabel("用途与简介").fill("Edited without signing in");
    await page
      .getByRole("button", { name: "保存到资源库", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Edited without signing in", { exact: true }),
    ).toBeVisible();
    expect(
      (await page.context().cookies()).filter(
        (cookie) => cookie.name === "atlas_session",
      ),
    ).toEqual([]);
    const anon = await browser.newContext();
    const privateResponse = await anon.request.get(
      `${origin}/api/public/resources/${id}`,
    );
    expect(privateResponse.status()).toBe(404);
    await page.getByRole("button", { name: "预览并发布" }).click();
    await expect(page.getByRole("dialog")).not.toContainText(
      "PRIVATE NOTE MUST NEVER LEAK",
    );
    await page.getByRole("button", { name: "确认发布", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "撤回发布", exact: true }),
    ).toBeVisible();
    const publicResponse = await anon.request.get(
      `${origin}/api/public/resources/${id}`,
    );
    expect(publicResponse.status()).toBe(200);
    expect(await publicResponse.text()).not.toContain(
      "PRIVATE NOTE MUST NEVER LEAK",
    );
    await page.getByRole("button", { name: "撤回发布", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "预览并发布" }),
    ).toBeVisible();
    expect(
      (await anon.request.get(`${origin}/api/public/resources/${id}`)).status(),
    ).toBe(404);
    await anon.close();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "移入回收站" }).click();
    await expect(page).toHaveURL(/trash=true/);
    await page.getByRole("link", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "恢复资源", exact: true }).click();
    await expect(page.getByRole("button", { name: "编辑资源" })).toBeEnabled();
  } finally {
    if (id) {
      const { default: postgres } = await import("postgres");
      const { config } = await import("dotenv");
      config({ quiet: true });
      const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
      await sql`DELETE FROM audit_events WHERE resource_id=${id}`;
      await sql`DELETE FROM resources WHERE id=${id}`;
      await sql.end();
    }
  }
});
test("tools, organization, preferences and backup export work", async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByRole("link", { name: "颜色工具", exact: true }).click();
  await page.getByRole("button", { name: "对比度检测", exact: true }).click();
  await page.getByLabel("前景 / 文字颜色").fill("#000");
  await page.getByLabel("背景颜色", { exact: true }).fill("#fff");
  await expect(page.locator(".contrast-score")).toContainText("21.00");
  await page.getByRole("link", { name: "分类与标签", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "整理你的灵感" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "偏好设置", exact: true }).click();
  await page.getByLabel("界面主题").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("界面主题").selectOption("light");
  await page.getByRole("link", { name: "导入与导出", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "完整 JSON 数据" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const path = await file.path();
  const json = JSON.parse(await readFile(path!, "utf8"));
  expect(json.resources).toHaveLength(27);
  expect(json.categories).toHaveLength(4);
  expect(json.collections).toHaveLength(3);
  expect(
    json.resources.every(
      (r: { privateNote?: string }) => !("privateNote" in r),
    ),
  ).toBe(true);
});

test("manual bookmark and selective JSON import persist without third-party fetching", async ({
  page,
}) => {
  await openLibrary(page);
  const suffix = String(Date.now()),
    bookmark = "QA bookmark " + suffix,
    imported = "QA import " + suffix;
  const created: string[] = [];
  let importKey = "";
  try {
    await page.getByRole("button", { name: "新增资源", exact: true }).click();
    await page
      .getByRole("combobox", { name: "资源类型" })
      .selectOption("website");
    await page
      .getByLabel("网站地址")
      .fill("https://unreachable.example.com/test?utm_source=qa&id=2");
    await page.getByLabel("名称", { exact: true }).fill(bookmark);
    await page
      .getByRole("button", { name: "保存到资源库", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: bookmark, exact: true }),
    ).toBeVisible();
    created.push(page.url().split("/").pop()!);
    await expect(page.locator(".website-detail-link")).toHaveAttribute(
      "href",
      "https://unreachable.example.com/test?id=2",
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: bookmark, exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "导入与导出", exact: true }).click();
    const doc = JSON.stringify({
      schemaVersion: 1,
      product: "color-atlas",
      resources: [
        {
          type: "color",
          title: imported,
          colors: [{ input: "rgb(12.34567 10 20 / .5)" }],
        },
        { type: "color", title: "Invalid", colors: [{ input: "bad-input" }] },
      ],
    });
    await page.getByLabel("导入文件").setInputFiles({
      name: "qa.json",
      mimeType: "application/json",
      buffer: Buffer.from(doc),
    });
    await expect(page.getByRole("heading", { name: "导入预览" })).toBeVisible();
    await expect(page.locator(".import-preview")).toContainText("错误 1 项");
    await page.getByRole("button", { name: "确认导入所选资源" }).click();
    await expect(page.getByRole("status")).toContainText("成功导入 1 项");
    const rows = await (
      await page.request.get("/api/resources?q=" + encodeURIComponent(imported))
    ).json();
    expect(rows.resources).toHaveLength(1);
    created.push(rows.resources[0].id);
    expect(rows.resources[0].visibility).toBe("private");
    expect(rows.resources[0].colors[0].value.alpha).toBe(0.5);
    const { createHash } = await import("node:crypto");
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    importKey = hash(hash(doc) + "[0]" + "skip");
  } finally {
    const { default: postgres } = await import("postgres");
    const { config } = await import("dotenv");
    config({ quiet: true });
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    for (const id of created) {
      await sql`DELETE FROM audit_events WHERE resource_id=${id}`;
      await sql`DELETE FROM resources WHERE id=${id}`;
    }
    if (importKey)
      await sql`DELETE FROM import_jobs WHERE source_hash=${importKey}`;
    await sql.end();
  }
});

test("workspace works without cookies and removed auth routes stay unavailable", async ({
  request,
}) => {
  const library = await request.get("/api/resources");
  expect(library.status()).toBe(200);
  expect(library.headers()["set-cookie"]).toBeUndefined();
  expect((await request.storageState()).cookies).toEqual([]);
  expect((await request.get("/api/auth/session")).status()).toBe(404);
  for (const action of ["login", "logout"]) {
    const removed = await request.post(`/api/auth/${action}`, {
      headers: { origin },
      data: {},
    });
    expect(removed.status()).toBe(404);
    expect(removed.headers()["set-cookie"]).toBeUndefined();
  }
  const untrusted = await request.post("/api/resources", {
    headers: { origin: "https://untrusted.example" },
    data: {},
  });
  expect(untrusted.status()).toBe(403);
});
