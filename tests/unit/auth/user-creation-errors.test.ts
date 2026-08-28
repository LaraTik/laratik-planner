import { describe, expect, it } from "vitest";
import {
  ActiveAgencyMemberError,
  InvalidPasswordError,
  UserAlreadyExistsError,
} from "@/lib/auth/user-creation";

/**
 * The three typed errors `createUserDirectly` throws. The action
 * (src/app/(app)/app/users/actions.ts:createUserDirectlyAction)
 * pattern-matches on `instanceof` for each, so the class name
 * + `name` property are part of the public contract. A typo here
 * breaks the action's error translation.
 */
describe("user-creation typed errors", () => {
  it("UserAlreadyExistsError carries the email and the expected name", () => {
    const err = new UserAlreadyExistsError("alice@example.com");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UserAlreadyExistsError);
    expect(err.name).toBe("UserAlreadyExistsError");
    expect(err.email).toBe("alice@example.com");
    expect(err.message).toContain("alice@example.com");
  });

  it("ActiveAgencyMemberError carries the email and the expected name", () => {
    const err = new ActiveAgencyMemberError("bob@example.com");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ActiveAgencyMemberError);
    expect(err.name).toBe("ActiveAgencyMemberError");
    expect(err.email).toBe("bob@example.com");
    expect(err.message).toContain("bob@example.com");
  });

  it("InvalidPasswordError is a plain Error with the expected name", () => {
    const err = new InvalidPasswordError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidPasswordError);
    expect(err.name).toBe("InvalidPasswordError");
    expect(err.message.toLowerCase()).toContain("password");
  });
});
