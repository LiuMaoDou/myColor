import { test, expect, type Page } from "@playwright/test";
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
  const current = await (await page.request.get("/api/resources")).json();
  await expect(page.locator(".resource-card")).toHaveCount(
    current.resources.length,
  );
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
  const current = await (await page.request.get("/api/resources")).json();
  await expect(page.locator(".resource-card")).toHaveCount(
    current.resources.length,
  );
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
  await expect(page.getByRole("dialog").locator(".nav-link")).toHaveText([
    "我的资源库",
    "单色",
    "色板",
    "网站",
  ]);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(errors).toEqual([]);
});
test("simplified palette creation, editing, metadata preservation and deletion", async ({
  page,
}) => {
  await openLibrary(page);
  const title = "QA palette " + Date.now();
  let id = "";
  try {
    await page.goto("/new");
    await page
      .getByLabel("颜色数据", { exact: true })
      .fill("#287F83; rgba(255,0,0,0.5)");
    await page.getByLabel("名字", { exact: true }).fill(title);
    await expect(page.locator(".color-preview-card > span")).toHaveCount(2);
    await expect(page.getByLabel("私有笔记")).toHaveCount(0);
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
    // Existing hidden metadata must survive editing through the simplified form.
    const seeded = await page.request.patch(`/api/resources/${id}`, {
      headers: { origin },
      data: {
        ...saved,
        privateNote: "PRIVATE NOTE MUST NEVER LEAK",
        description: "Existing description",
        expectedVersion: saved.version,
      },
    });
    expect(seeded.ok()).toBe(true);
    await page.goto(`/library?q=${encodeURIComponent(title)}`);
    const card = page.locator(".resource-card").filter({ hasText: title });
    await card.getByRole("link", { name: `编辑 ${title}` }).click();
    await expect(page).toHaveURL(new RegExp(`/resources/${id}/edit$`));
    await expect(page.getByLabel("颜色数据")).toHaveValue(
      saved.colors.map((c: { input: string }) => c.input).join("\n"),
    );
    await page.getByLabel("颜色数据").fill("#287F83\nrgba(0,0,255,0.5)");
    await page
      .getByRole("button", { name: "保存到资源库", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Existing description", { exact: true }),
    ).toBeVisible();
    expect(
      (await page.context().cookies()).filter(
        (cookie) => cookie.name === "atlas_session",
      ),
    ).toEqual([]);
    const edited = await (
      await page.request.get(`/api/resources/${id}`)
    ).json();
    expect(edited.privateNote).toBe("PRIVATE NOTE MUST NEVER LEAK");
    expect(edited.colors[1].input).toBe("rgba(0,0,255,0.5)");
    await expect(
      page.getByRole("button", { name: /发布|恢复资源/ }),
    ).toHaveCount(0);
    expect(
      (await page.request.get(`/api/public/resources/${id}`)).status(),
    ).toBe(404);
    for (const action of ["publish", "archive", "restore", "favorite"]) {
      expect(
        (
          await page.request.post(`/api/resources/${id}/${action}`, {
            headers: { origin },
            data: { expectedVersion: edited.version },
          })
        ).status(),
      ).toBe(404);
    }
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "删除资源", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
    expect((await page.request.get(`/api/resources/${id}`)).status()).toBe(404);
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
test("cards can be deleted directly with cancellation, retry and mobile support", async ({
  page,
}) => {
  const created: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const title = "QA delete card " + Date.now();
    for (const colors of [["#287F83"], ["#287F83", "#FFF9F0"]]) {
      const response = await page.request.post("/api/resources", {
        headers: { origin },
        data: {
          type: colors.length === 1 ? "color" : "palette",
          title: `${title} ${colors.length}`,
          colors: colors.map((input) => ({ input })),
        },
      });
      expect(response.ok()).toBe(true);
      created.push((await response.json()).id);
    }
    await page.goto(`/library?q=${encodeURIComponent(title)}`);
    await expect(page.locator(".resource-card")).toHaveCount(2);
    for (const [index, id] of created.entries()) {
      await expect(
        page.getByRole("link", { name: `编辑 ${title} ${index + 1}` }),
      ).toHaveAttribute("href", `/resources/${id}/edit`);
    }
    const card = page.locator(".resource-card").filter({
      has: page.getByRole("link", { name: `${title} 1`, exact: true }),
    });
    const remove = card.getByRole("button", {
      name: `删除 ${title} 1`,
      exact: true,
    });
    await expect(remove).toBeVisible();
    let deletes = 0;
    page.on("request", (r) => {
      if (r.method() === "DELETE") deletes++;
    });
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(`${title} 1`);
      await dialog.dismiss();
    });
    await remove.click();
    await expect(card).toBeVisible();
    expect(deletes).toBe(0);
    expect((await page.request.get(`/api/resources/${created[0]}`)).ok()).toBe(
      true,
    );

    // A failed delete must keep the card available for a retry.
    const endpoint = `**/api/resources/${created[0]}`;
    await page.route(endpoint, async (route) => {
      if (route.request().method() === "DELETE")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "暂时无法删除，请重试" } }),
        });
      else await route.continue();
    });
    page.once("dialog", (dialog) => dialog.accept());
    await remove.click();
    await expect(
      page.getByText("暂时无法删除，请重试", { exact: true }),
    ).toBeVisible();
    await expect(card).toBeVisible();
    await expect(remove).toBeEnabled();
    await page.unroute(endpoint);

    await page.getByRole("button", { name: "批量选择", exact: true }).click();
    await page
      .getByRole("checkbox", { name: `选择 ${title} 1`, exact: true })
      .check();
    await expect(page.locator(".batch-toolbar")).toContainText("已选 1 项");
    // While the server is pending, repeated clicks must not send another delete.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(endpoint, async (route) => {
      if (route.request().method() === "DELETE") await gate;
      await route.continue();
    });
    try {
      page.once("dialog", (dialog) => dialog.accept());
      await remove.click();
      await expect(remove).toBeDisabled();
      await expect(remove).toHaveText("删除中…");
      await remove.evaluate((button: HTMLButtonElement) => button.click());
      expect(deletes).toBe(2);
    } finally {
      release();
    }
    await expect(card).toHaveCount(0);
    await expect(page.locator(".resource-card")).toHaveCount(1);
    await expect(page.locator(".batch-toolbar")).toContainText("已选 0 项");
    await expect(page.locator(".list-footer")).toContainText("1 项资源");
    expect(
      (await page.request.get(`/api/resources/${created[0]}`)).status(),
    ).toBe(404);
    await page.unroute(endpoint);
    await page.reload();
    await expect(card).toHaveCount(0);
    await expect(page.locator(".resource-card")).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    const paletteRemove = page.getByRole("button", {
      name: `删除 ${title} 2`,
      exact: true,
    });
    await expect(paletteRemove).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await paletteRemove.click();
    await expect(
      page.getByRole("heading", { name: "这里还没有资源" }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp("/library\\?q="));
    expect(
      (await page.request.get(`/api/resources/${created[1]}`)).status(),
    ).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    const { default: postgres } = await import("postgres");
    const { config } = await import("dotenv");
    config({ quiet: true });
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    for (const id of created) {
      await sql`DELETE FROM audit_events WHERE resource_id=${id}`;
      await sql`DELETE FROM resources WHERE id=${id}`;
    }
    await sql.end();
  }
});

test("navigation only shows the library and resource types", async ({
  page,
}) => {
  await openLibrary(page);
  await expect(page.locator(".sidebar .nav-link")).toHaveText([
    "我的资源库",
    "单色",
    "色板",
    "网站",
  ]);
  await expect(page.locator(".sidebar-footer")).toHaveCount(0);
  await expect(page.locator(".sidebar")).not.toContainText(
    /我的收藏|颜色工具|导入与导出|偏好设置|每一种颜色/,
  );
  await expect(
    page.getByRole("button", { name: /^收藏 |^取消收藏 / }),
  ).toHaveCount(0);
  await page
    .locator(".resource-card [data-slot='card-title'] a")
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "编辑资源", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(收藏|已收藏|导出 JSON)$/ }),
  ).toHaveCount(0);
  for (const path of [
    "/tools",
    "/tools/contrast",
    "/settings/data",
    "/settings/preferences",
    "/library?favorite=true",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(origin + "/library");
    await expect(
      page.getByRole("heading", { name: "我的资源库", exact: true }),
    ).toBeVisible();
  }
});

test("manual bookmark persists without third-party fetching", async ({
  page,
}) => {
  await openLibrary(page);
  const bookmark = "QA bookmark " + Date.now();
  const created: string[] = [];
  try {
    await page.getByRole("link", { name: "网站", exact: true }).click();
    await page.getByRole("button", { name: "添加网站", exact: true }).click();
    await page
      .getByLabel("网站地址")
      .fill("https://unreachable.example.com/test?utm_source=qa&id=2");
    await page.getByLabel("名字", { exact: true }).fill(bookmark);
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
  } finally {
    const { default: postgres } = await import("postgres");
    const { config } = await import("dotenv");
    config({ quiet: true });
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    for (const id of created) {
      await sql`DELETE FROM audit_events WHERE resource_id=${id}`;
      await sql`DELETE FROM resources WHERE id=${id}`;
    }
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

test("retired features stay absent and the compact editor works on desktop and mobile", async ({
  page,
}) => {
  await openLibrary(page);
  const retired =
    /合集|分类|标签|回收站|已归档|公开资源|我的收藏|颜色工具|导入与导出|偏好设置|每一种颜色/;
  await expect(page.locator(".sidebar")).not.toContainText(retired);
  await expect(
    page.locator(".resource-card .tags, .resource-card .visibility"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "批量选择", exact: true }).click();
  await expect(page.locator(".batch-toolbar")).not.toContainText(
    /分类|标签|合集|归档|恢复/,
  );
  for (const path of [
    "/manage/collections",
    "/manage/categories",
    "/collections/legacy",
    "/explore",
    "/library?trash=true&status=archived&tag=old&category=old&collection=old",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(origin + "/library");
    await expect(
      page.getByRole("heading", { name: "我的资源库", exact: true }),
    ).toBeVisible();
  }
  for (const path of [
    "/api/organization",
    "/api/categories",
    "/api/tags",
    "/api/collections",
    "/api/public/resources",
  ]) {
    expect((await page.request.get(path)).status()).toBe(404);
  }
  await page.goto("/new");
  const input = page.getByLabel("颜色数据", { exact: true });
  const preview = page.getByRole("img", { name: "颜色卡片" });
  const save = page.getByRole("button", { name: "保存到资源库", exact: true });
  await expect(page.getByRole("button", { name: "添加网站书签" })).toHaveCount(
    0,
  );
  await expect(page.locator(".editor-layout")).not.toContainText(
    "只需填写颜色数据",
  );
  await expect(input).toHaveAttribute("rows", "1");
  await expect(save).toBeDisabled();
  await input.fill("#34786A");
  await page.getByLabel("名字", { exact: true }).fill("松林绿");
  await expect(input).toHaveValue("#34786A");
  await expect(save).toBeEnabled();
  await expect(preview).toHaveText("");
  await expect(preview.locator("span")).toHaveCSS(
    "background-color",
    "rgb(52, 120, 106)",
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const field = await input.boundingBox(),
      card = await preview.boundingBox();
    expect(field!.height).toBeLessThanOrEqual(44);
    expect(card!.x).toBeGreaterThanOrEqual(field!.x + field!.width);
    expect(Math.abs(card!.y - field!.y)).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await input.fill("#34786A; rgba(255,0,0,0.5)");
  await expect(preview.locator("span")).toHaveCount(2);
  await expect(preview).toHaveText("");
  await input.fill("not-a-color");
  await expect(save).toBeDisabled();
  await page.getByLabel("打开导航").click();
  await expect(page.getByRole("dialog")).not.toContainText(retired);
});

test("inline add supports default and custom names without leaving the library", async ({
  page,
}) => {
  const created: string[] = [];
  try {
    await openLibrary(page);
    await expect(
      page
        .locator(".section-heading")
        .getByRole("button", { name: "添加颜色", exact: true }),
    ).toHaveCount(0);
    const input = page.getByLabel("快速输入颜色", { exact: true });
    await input.click();
    const name = page.getByLabel("名字（可选）", { exact: true });
    const add = page
      .locator(".quick-entry")
      .getByRole("button", { name: "添加", exact: true });
    await expect(input).toBeFocused();
    await expect(page).toHaveURL(/\/(library)?$/);
    await add.click();
    await expect(page.locator("#quick-color-error")).toHaveText(
      "请输入颜色数据",
    );
    await input.fill("not-a-color");
    await add.click();
    await expect(page.locator("#quick-color-error")).toContainText("无法识别");
    await expect(input).toHaveValue("not-a-color");

    // A failed request must retain the user's input for a retry.
    await page.route("**/api/resources", async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "暂时无法保存，请重试" } }),
        });
      else await route.continue();
    });
    const color = "rgb(17, 93, 142)";
    await input.fill(color);
    await name.fill("重试名称");
    await add.click();
    await expect(page.locator("#quick-color-error")).toHaveText(
      "暂时无法保存，请重试",
    );
    await expect(input).toHaveValue(color);
    await expect(name).toHaveValue("重试名称");
    await expect(add).toBeEnabled();
    await page.unroute("**/api/resources");
    await name.fill("   ");

    // Hold the request to verify repeated submits cannot create duplicates.
    let writes = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/resources", async (route) => {
      if (route.request().method() === "POST") {
        writes++;
        await gate;
      }
      await route.continue();
    });
    const response = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/resources" &&
        r.request().method() === "POST",
    );
    await add.click();
    await expect(input).toBeDisabled();
    await expect(name).toBeDisabled();
    await page.locator(".quick-entry").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    release();
    const saved = await (await response).json();
    created.push(saved.id);
    expect(saved.title).toBe(color);
    expect(saved.colors[0].input).toBe(color);
    expect(writes).toBe(1);
    await page.unroute("**/api/resources");
    await expect(page).toHaveURL(/\/(library)?$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: color, exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(name).toHaveValue("");
    await page.reload();
    await expect(
      page.getByRole("link", { name: color, exact: true }),
    ).toBeVisible();

    await page.goto(
      "/library?type=palette&favorite=true&q=nonmatching-inline-check&sort=name&page=2",
    );
    const hex = "#c26d83";
    const customName = "玫瑰粉 QA " + Date.now();
    await input.fill(hex);
    await name.fill("  " + customName + "  ");
    const hexResponse = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/resources" &&
        r.request().method() === "POST",
    );
    await name.press("Enter");
    const hexSaved = await (await hexResponse).json();
    created.push(hexSaved.id);
    expect(hexSaved.title).toBe(customName);
    expect(hexSaved.colors[0].input).toBe(hex);
    expect(hexSaved.type).toBe("color");
    await expect(page).toHaveURL(origin + "/library?type=color&sort=recent");
    await expect(
      page.getByRole("link", { name: customName, exact: true }),
    ).toBeVisible();
    await expect(name).toHaveValue("");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("link", { name: customName, exact: true }),
    ).toBeVisible();

    const paletteName = "海边配色 QA " + Date.now();
    await input.fill("#287F83; #FFF9F0; #F2B84B");
    await name.fill(paletteName);
    const paletteResponse = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/resources" &&
        r.request().method() === "POST",
    );
    await add.click();
    const paletteSaved = await (await paletteResponse).json();
    created.push(paletteSaved.id);
    expect(paletteSaved.type).toBe("palette");
    expect(paletteSaved.title).toBe(paletteName);
    expect(paletteSaved.colors).toHaveLength(3);
    await expect(
      page.getByRole("link", { name: paletteName, exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(name).toHaveValue("");
  } finally {
    const { default: postgres } = await import("postgres");
    const { config } = await import("dotenv");
    config({ quiet: true });
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    for (const id of created) {
      await sql`DELETE FROM audit_events WHERE resource_id=${id}`;
      await sql`DELETE FROM resources WHERE id=${id}`;
    }
    await sql.end();
  }
});
