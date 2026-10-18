import type { Customer } from "@prisma/client";
import type { Db } from "../db.js";
import { newSessionToken, sha256 } from "../security/tokens.js";

export type PublicCustomer = {
  id: string;
  name: string;
  email: string;
  /** "google" for an account that has no password (it was created with Google), otherwise "password". */
  provider: "password" | "google";
  /** Whether the email address has been proven to belong to this customer (Google, verification link or reset code). */
  emailVerified: boolean;
  /** When the account was created (ISO 8601), shown as "Member since". */
  createdAt: string;
  picture?: string;
};

export const toPublicCustomer = (customer: Customer): PublicCustomer => ({
  id: String(customer.id),
  name: customer.name,
  email: customer.email,
  provider: customer.passwordHash ? "password" : "google",
  emailVerified: customer.emailVerifiedAt !== null,
  createdAt: customer.createdAt.toISOString(),
  ...(customer.pictureUrl ? { picture: customer.pictureUrl } : {}),
});

const day = 24 * 60 * 60 * 1000;

export const cookieName = "pf_session";

export type SessionStore = ReturnType<typeof createSessionStore>;

export function createSessionStore(db: Db, sessionDays: number) {
  return {
    /** Starts a session for the customer and returns the token to put in the cookie. */
    async create(customerId: number, userAgent: string | undefined) {
      const token = newSessionToken();
      const expiresAt = new Date(Date.now() + sessionDays * day);
      await db.session.create({ data: { customerId, tokenHash: sha256(token), expiresAt, userAgent: userAgent?.slice(0, 255) ?? null } });
      return { token, expiresAt };
    },

    /** The customer a cookie token belongs to, or null when it is unknown or expired. */
    async find(token: string): Promise<Customer | null> {
      const session = await db.session.findFirst({ where: { tokenHash: sha256(token), expiresAt: { gt: new Date() } }, include: { customer: true } });
      return session?.customer ?? null;
    },

    async destroy(token: string) {
      await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
    },

    /** Ends every session of a customer, e.g. after a password change. */
    async destroyAll(customerId: number) {
      await db.session.deleteMany({ where: { customerId } });
    },

    /** Housekeeping: removes sessions that have already expired. */
    async purgeExpired() {
      await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    },
  };
}
