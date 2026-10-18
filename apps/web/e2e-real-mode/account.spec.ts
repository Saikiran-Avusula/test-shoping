import { expect, test, type Page } from "@playwright/test";

// Runs against a build made with NEXT_PUBLIC_API_URL=http://localhost:4001 (see the test:e2e:real-mode script).
// The store API is faked here, so these tests prove what the SITE does with real accounts, not what the server does.
const api = "http://localhost:4001/api/v1";

const customer = { id: "7", name: "Meera Kumar", email: "meera@example.com", provider: "password", emailVerified: true, createdAt: "2026-03-15T09:30:00.000Z" };
const address = (id: number) => ({ id: String(id), type: "Home", label: "", name: "Priya Rao", phone: "9876543210", pincode: "500034", house: "12-3-45", street: "Road No. 5", city: "Hyderabad", state: "Telangana", isDefault: id === 1 });

/** Fakes the store API. `signedIn` is flipped by the fake login, like the real session cookie would. */
async function fakeApi(page: Page, options: { signedIn: boolean; addresses?: number }) {
  const state = { signedIn: options.signedIn, addressRequests: 0 };
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const cors = { "access-control-allow-origin": request.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type" };
    const json = (status: number, body: unknown) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET,POST,PUT,DELETE" } });
    if (path === "/auth/me") return state.signedIn ? json(200, { user: customer }) : json(401, { message: "Please sign in." });
    if (path === "/auth/login") {
      state.signedIn = true;
      return json(200, { user: customer });
    }
    if (path === "/addresses") {
      state.addressRequests += 1;
      if (!state.signedIn) return json(401, { message: "Please sign in." });
      return json(200, { addresses: Array.from({ length: options.addresses ?? 0 }, (_, index) => address(index + 1)) });
    }
    return json(404, { message: "not faked" });
  });
  return state;
}

test.describe("account pages with real accounts", () => {
  test("a signed-out visitor is sent to sign in and, after signing in, back to the page they asked for", async ({ page }) => {
    await fakeApi(page, { signedIn: false });
    for (const path of ["/account", "/account/orders"]) {
      await page.goto(path);
      await expect(page).toHaveURL(`http://localhost:3101/login?next=${path}`);
      await expect(page.getByRole("heading", { name: "Welcome back", level: 1 })).toBeVisible();
    }

    await page.getByLabel("Email address").fill("meera@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Saree2026");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
    await expect(page.getByRole("heading", { name: "My Orders", level: 1 })).toBeVisible();
  });

  test("a signed-out visitor never sees sample data or loads anyone's addresses", async ({ page }) => {
    const state = await fakeApi(page, { signedIn: false });
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=\/account$/);
    expect(state.addressRequests).toBe(0);
    await expect(page.getByText("PF123456")).toHaveCount(0);
  });

  test("a new customer sees their own details and a clear no-orders state, with no invented figures", async ({ page }) => {
    const state = await fakeApi(page, { signedIn: true, addresses: 2 });
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Hello, Meera" })).toBeVisible();
    await expect(page.getByText("Member since Mar 2026")).toBeVisible();

    // real numbers only: no orders, and the address count comes from the API
    await expect(page.locator("[class*=stat]", { hasText: "Total orders" }).first()).toContainText("0");
    await expect(page.locator("[class*=stat]", { hasText: "Saved Addresses" }).first()).toContainText("2");
    await expect(page.getByText("No orders yet")).toBeVisible();
    expect(state.addressRequests).toBeGreaterThan(0);

    // nothing from the design sample or from features that do not exist yet
    for (const invented of ["Silver", "Wishlist Items", "View Wishlist", "PF123456", "Demo account data"]) {
      await expect(page.getByText(invented, { exact: false })).toHaveCount(0);
    }
    const sidebar = page.getByRole("navigation", { name: "Account sections" });
    await expect(sidebar.getByText("My Orders", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Wishlist", { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText("Membership", { exact: true })).toHaveCount(0);
  });

  test("the orders page says there are no orders and offers no search over nothing", async ({ page }) => {
    await fakeApi(page, { signedIn: true });
    await page.goto("/account/orders");
    await expect(page.getByRole("heading", { name: "My Orders", level: 1 })).toBeVisible();
    await expect(page.getByText("No orders yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start shopping" })).toHaveAttribute("href", "/new-arrivals");
    await expect(page.getByLabel("Search your orders")).toHaveCount(0);
    await expect(page.locator("[class*=orderCard]")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Order pages" })).toHaveCount(0);
  });

  test("a customer with no saved addresses sees 0", async ({ page }) => {
    await fakeApi(page, { signedIn: true, addresses: 0 });
    await page.goto("/account");
    await expect(page.locator("[class*=stat]", { hasText: "Saved Addresses" }).first()).toContainText("0");
  });
});
