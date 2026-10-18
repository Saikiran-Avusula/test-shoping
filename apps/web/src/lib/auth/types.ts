/** A signed-in customer, as the rest of the site sees them. */
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  /** "google" for an account created with Google that has no password, otherwise "password". */
  provider: "password" | "google";
  /** Whether the email address has been proven to belong to this customer (Google, the emailed link, or a reset code). */
  emailVerified: boolean;
  /** When the account was created (ISO 8601). Sent by the store API; the demo accounts have none. */
  createdAt?: string;
  picture?: string;
};

export type AuthField = "name" | "email" | "password" | "code" | "token";

export type SignUpInput = { name: string; email: string; password: string };

/** An expected, customer-facing failure (wrong password, email already used...). `field` and `errors` say which inputs it belongs to. */
export class AuthError extends Error {
  constructor(
    message: string,
    public field?: AuthField,
    /** One message per input, when the server checked several at once. */
    public errors?: Partial<Record<AuthField, string>>,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Everything the account pages need from an account system. The store API and the opt-in demo both implement it. */
export type AuthClient = {
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(input: SignUpInput): Promise<AuthUser>;
  /** `credential` is the Google ID token (a JWT) handed over by Google Identity Services. */
  signInWithGoogle(credential: string): Promise<AuthUser>;
  /** Emails a 6-digit code. The answer is the same whether or not the email has an account. */
  startPasswordReset(email: string): Promise<void>;
  /** Checks the code and sets the new password; the customer then signs in again. */
  finishPasswordReset(input: { email: string; code: string; password: string }): Promise<void>;
  /** Opens the link from the verification email: marks the email as verified. Throws an AuthError when the link is invalid, expired or used. */
  verifyEmail(token: string): Promise<AuthUser>;
  /** Sends a fresh verification link to the signed-in customer. Resolves with the message to show. */
  resendVerification(): Promise<string>;
  signOut(): Promise<void>;
  /** The signed-in user the server remembers, or null. */
  current(): Promise<AuthUser | null>;
};
