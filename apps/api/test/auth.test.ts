import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { apiPrefix } from "../src/app.js";
import { Prisma } from "@prisma/client";
import { browser, db, googleToken, makeApp, origin, person, resetDatabase } from "./helpers.js";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

const customers = () => db.customer.count();

describe("email signup", () => {
  it("creates the account, signs in with an httpOnly cookie, and never returns or stores the plain password", async () => {
    const { app } = makeApp();
    const me = browser(app);
    const res = await me.post("/auth/signup", person());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Test Buyer 1", email: "buyer1@example.com", provider: "password" });
    expect(new Date(res.body.user.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(Object.keys(res.body.user).sort()).toEqual(["createdAt", "email", "emailVerified", "id", "name", "provider"]); // nothing secret in the reply

    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/pf_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    expect((await me.get("/auth/me")).body.user.email).toBe("buyer1@example.com");

    const stored = (await db.customer.findFirstOrThrow()).passwordHash!;
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).not.toContain("Saree2026");

    // the database keeps only a hash of the session token, so a leaked table cannot be used to sign in
    const token = /pf_session=([^;]+)/.exec(cookie)![1]!;
    expect((await db.session.findFirstOrThrow()).tokenHash).not.toBe(token);
  });

  it("says exactly what is wrong with each field", async () => {
    const { app } = makeApp();
    const empty = await browser(app).post("/auth/signup", {});
    expect(empty.status).toBe(422);
    expect(empty.body.errors).toEqual({
      name: "Enter your full name.",
      email: "Enter your email address.",
      password: "Create a password.",
    });

    const bad = await browser(app).post("/auth/signup", { name: "A", email: "not-an-email", password: "short" });
    expect(bad.body.errors).toEqual({
      name: "Enter your full name (at least 2 characters).",
      email: "Enter a valid email address, like name@example.com.",
      password: "Password must be at least 8 characters.",
    });
    expect((await browser(app).post("/auth/signup", { ...person(), password: "12345678" })).body.errors.password).toBe("Password needs at least one letter.");
    expect((await browser(app).post("/auth/signup", { ...person(), password: "abcdefgh" })).body.errors.password).toBe("Password needs at least one number.");
    expect(await customers()).toBe(0);
  });

  it("refuses a second account for the same email, whatever the letter case, and names the field", async () => {
    const { app } = makeApp();
    await browser(app).post("/auth/signup", person());
    const again = await browser(app).post("/auth/signup", { ...person(2), email: "  BUYER1@Example.com " });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ field: "email", message: "An account with this email already exists. Please sign in instead." });
    expect(await customers()).toBe(1);
  });

  it("lets exactly one of several simultaneous signups with the same email through", async () => {
    const { app } = makeApp();
    const results = await Promise.all(Array.from({ length: 5 }, () => browser(app).post("/auth/signup", person())));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(4);
    expect(await customers()).toBe(1);
  });
});

describe("email login and logout", () => {
  it("signs in with the right password and gives one neutral message otherwise", async () => {
    const { app } = makeApp();
    await browser(app).post("/auth/signup", person());

    const ok = await browser(app).post("/auth/login", { email: "BUYER1@example.com", password: "Saree2026" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe("buyer1@example.com");

    const wrongPassword = await browser(app).post("/auth/login", { email: "buyer1@example.com", password: "Wrong1234" });
    const unknownEmail = await browser(app).post("/auth/login", { email: "nobody@example.com", password: "Wrong1234" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(wrongPassword.body.message).toBe("The email or password is incorrect.");

    const blank = await browser(app).post("/auth/login", { email: "", password: "" });
    expect(blank.body.errors).toEqual({ email: "Enter your email address.", password: "Enter your password." });
  });

  it("logout ends the session on the server, not just in the browser", async () => {
    const { app } = makeApp();
    const me = browser(app);
    await me.post("/auth/signup", person());
    const token = /pf_session=([^;]+)/.exec(String((await me.post("/auth/login", person())).headers["set-cookie"]))![1]!;

    expect((await me.post("/auth/logout")).status).toBe(204);
    expect((await me.get("/auth/me")).status).toBe(401);
    // replaying the old cookie by hand no longer works either
    const replay = await request(app).get(apiPrefix + "/auth/me").set("Cookie", `pf_session=${token}`);
    expect(replay.status).toBe(401);
  });

  it("is signed out without a cookie", async () => {
    const { app } = makeApp();
    expect((await browser(app).get("/auth/me")).body).toEqual({ message: "Please sign in to continue." });
  });

  it("slows down repeated wrong passwords", async () => {
    const { app } = makeApp({ limits: { login: 3 } });
    const me = browser(app);
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await me.post("/auth/login", { email: "buyer1@example.com", password: "Wrong1234" })).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });
});

describe("request origin (CSRF)", () => {
  it("refuses changes that do not come from the website", async () => {
    const { app } = makeApp();
    const noOrigin = await request(app).post(apiPrefix + "/auth/signup").send(person());
    expect(noOrigin.status).toBe(403);
    const foreign = await request(app).post(apiPrefix + "/auth/signup").set("Origin", "https://evil.example").send(person());
    expect(foreign.status).toBe(403);
    expect(await customers()).toBe(0);
    expect((await request(app).post(apiPrefix + "/auth/signup").set("Origin", origin).send(person())).status).toBe(201);
  });

  it("only allows the website to read responses with cookies (CORS)", async () => {
    const { app } = makeApp();
    const allowed = await request(app).get("/health").set("Origin", origin);
    expect(allowed.headers["access-control-allow-origin"]).toBe(origin);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    const foreign = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("Google sign-in", () => {
  it("gives a first-time Google user an account and lets them back in to the same one", async () => {
    const { app } = makeApp();
    const first = await browser(app).post("/auth/google", { credential: googleToken({ email: "Meera@Gmail.com", name: "Meera Kumar" }) });
    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({ name: "Meera Kumar", email: "meera@gmail.com", provider: "google" });

    const second = await browser(app).post("/auth/google", { credential: googleToken({ email: "meera@gmail.com", name: "Meera K" }) });
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await customers()).toBe(1);
    expect(await db.customerIdentity.count()).toBe(1);
  });

  it("uses the same account when the email already signed up with a password, and discards an unproven password", async () => {
    const { app } = makeApp();
    const attacker = browser(app);
    await attacker.post("/auth/signup", person()); // someone registered buyer1@example.com before its owner ever proved it
    expect((await attacker.get("/auth/me")).status).toBe(200);

    const owner = await browser(app).post("/auth/google", { credential: googleToken({ email: "buyer1@example.com" }) });
    expect(owner.status).toBe(200);
    expect(await customers()).toBe(1);

    // the pre-registered password no longer works and the session it opened is gone
    expect((await attacker.get("/auth/me")).status).toBe(401);
    const old = await browser(app).post("/auth/login", person());
    expect(old.status).toBe(401);
    expect(old.body.message).toMatch(/signs in with Google/);
  });

  it("keeps a password that was proven by an emailed code when Google links to the account", async () => {
    const { app, lastCode } = makeApp();
    await browser(app).post("/auth/signup", person());
    await browser(app).post("/auth/password/forgot", { email: "buyer1@example.com" });
    await browser(app).post("/auth/password/reset", { email: "buyer1@example.com", code: lastCode(), password: "NewSaree2027" });
    await browser(app).post("/auth/google", { credential: googleToken({ email: "buyer1@example.com" }) });
    expect((await browser(app).post("/auth/login", { email: "buyer1@example.com", password: "NewSaree2027" })).status).toBe(200);
  });

  it("does not let email signup take over an email that already belongs to a Google account", async () => {
    const { app } = makeApp();
    await browser(app).post("/auth/google", { credential: googleToken({ email: "meera@gmail.com" }) });
    const res = await browser(app).post("/auth/signup", { name: "Meera", email: "meera@gmail.com", password: "Saree2026" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ field: "email", message: "This email is already registered through Google. Please use Continue with Google." });
    expect(await customers()).toBe(1);
  });

  it("rejects tokens Google would not vouch for", async () => {
    const { app } = makeApp();
    const unverified = await browser(app).post("/auth/google", { credential: googleToken({ email: "x@gmail.com", emailVerified: false }) });
    expect(unverified.status).toBe(401);
    expect(unverified.body.message).toMatch(/not verified/);
    const garbage = await browser(app).post("/auth/google", { credential: "garbage" });
    expect(garbage.status).toBe(401);
    expect(garbage.body.message).toBe("Google sign-in could not be verified. Please try again.");
    expect((await browser(app).post("/auth/google", {})).status).toBe(422);
    expect(await customers()).toBe(0);
  });

  it("says plainly when Google sign-in is not configured on the server", async () => {
    const { app } = makeApp({ google: null });
    const res = await browser(app).post("/auth/google", { credential: "anything" });
    expect(res.status).toBe(503);
    expect(res.body.message).toBe("Google sign-in is not set up on the server yet.");
  });
});

describe("forgot password", () => {
  it("emails a code, accepts only the right one, sets the new password and ends every session", async () => {
    const { app, sent, lastCode } = makeApp();
    const signedIn = browser(app);
    await signedIn.post("/auth/signup", person());

    const forgot = await browser(app).post("/auth/password/forgot", { email: "buyer1@example.com" });
    expect(forgot.status).toBe(200);
    // signup already sent the verification link; the reset code is the second email
    expect(sent).toHaveLength(2);
    expect(sent[1]!.to).toBe("buyer1@example.com");
    expect(sent[1]!.subject).toMatch(/password reset code/);
    expect((await db.passwordReset.findFirstOrThrow()).codeHash).not.toContain(lastCode());

    const wrong = await browser(app).post("/auth/password/reset", { email: "buyer1@example.com", code: "000000", password: "NewSaree2027" });
    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({ field: "code", message: "That code is not correct. Please check it and try again." });

    const weak = await browser(app).post("/auth/password/reset", { email: "buyer1@example.com", code: lastCode(), password: "short" });
    expect(weak.body.errors.password).toBe("Password must be at least 8 characters.");

    const code = lastCode();
    const done = await browser(app).post("/auth/password/reset", { email: "buyer1@example.com", code, password: "NewSaree2027" });
    expect(done.status).toBe(204);
    expect((await signedIn.get("/auth/me")).status).toBe(401);
    expect((await browser(app).post("/auth/login", person())).status).toBe(401);
    expect((await browser(app).post("/auth/login", { email: "buyer1@example.com", password: "NewSaree2027" })).status).toBe(200);

    // a code works once
    const reuse = await browser(app).post("/auth/password/reset", { email: "buyer1@example.com", code, password: "Another2028" });
    expect(reuse.status).toBe(400);
  });

  it("answers the same for an email that has no account, and sends nothing", async () => {
    const { app, sent } = makeApp();
    const res = await browser(app).post("/auth/password/forgot", { email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If an account matches, we have emailed a 6-digit code.");
    expect(sent).toHaveLength(0);
  });

  it("locks a code after five wrong guesses", async () => {
    const { app, lastCode } = makeApp();
    await browser(app).post("/auth/signup", person());
    await browser(app).post("/auth/password/forgot", { email: "buyer1@example.com" });
    const real = lastCode();
    for (let i = 0; i < 5; i++) await browser(app).post("/auth/password/reset", { email: "buyer1@example.com", code: "000000", password: "NewSaree2027" });
    const late = await browser(app).post("/auth/password/reset", { email: "buyer1@example.com", code: real, password: "NewSaree2027" });
    expect(late.status).toBe(400);
    expect(late.body.message).toMatch(/Too many wrong codes/);
  });

  it("says so when no email service is set up, instead of pretending a message went out", async () => {
    const { app } = makeApp({ mailer: null });
    const res = await browser(app).post("/auth/password/forgot", { email: "buyer1@example.com" });
    expect(res.status).toBe(503);
    expect(res.body.message).toBe("Password reset by email is not set up on the server yet.");
  });
});
