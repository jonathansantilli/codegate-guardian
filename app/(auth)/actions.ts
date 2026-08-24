"use server";

import { z } from "zod";

import {
  createFirstUser,
  createUser,
  getUser,
  hasAnyUser,
} from "@/lib/db/queries";
import { isValidSetupToken } from "@/lib/security/setup-token";
import { getContainer } from "@/src/infrastructure";

import { signIn } from "./auth";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "closed"
    | "bad_setup_token"
    | "setup_token_missing"
    | "invalid_data";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    // The signed-in branch below is the only one that may create a further
    // account, so resolve the session before saying anything at all about
    // which addresses exist. Answering "user_exists" to an anonymous caller
    // on a claimed instance is an oracle: it distinguishes the operator's
    // address from every other, unauthenticated and unlimited, which is the
    // first half of a password-spraying attempt.
    const { auth } = await import("./auth");
    const session = await auth();

    if (!session?.user && (await hasAnyUser())) {
      return { status: "closed" } as RegisterActionState;
    }

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }

    // The first account bootstraps the instance. Left open, reaching the port
    // was one POST away from full console authority — every machine, the fleet
    // export, and minting enrolment codes.
    //
    // The signed-in branch below is not reachable through the UI: this version
    // has one operator, and proxy.ts sends a signed-in visitor away from
    // /register. It stays as the guard it is, so that if an affordance to add
    // an operator is ever built, the action already requires a session.
    //
    // These checks live here rather than in the proxy's public-path list: a
    // server action is dispatched by its id, not by the path it was posted
    // to, so it can be invoked through any public route.
    if (session?.user) {
      await createUser(validatedData.email, validatedData.password);
      return { status: "success" };
    }

    // Claimed already? Say so, before saying anything about the token — a
    // token complaint on a claimed instance is both wrong and an invitation
    // to keep guessing at one that no longer opens anything. createFirstUser
    // below is still what actually adjudicates; this is for the message.
    // (An anonymous caller was already turned away above.)
    if (await hasAnyUser()) {
      return { status: "closed" } as RegisterActionState;
    }

    // Claiming an unclaimed instance needs the token whoever deployed it set.
    // Without this, the window between `docker compose up` and the operator
    // reaching the form belongs to whoever finds the port first.
    const expected = getContainer().env.SETUP_TOKEN;
    if (!expected) {
      return { status: "setup_token_missing" } as RegisterActionState;
    }

    const presented = formData.get("setupToken");
    if (
      !isValidSetupToken(
        typeof presented === "string" ? presented : undefined,
        expected
      )
    ) {
      return { status: "bad_setup_token" } as RegisterActionState;
    }

    const claimed = await createFirstUser(
      validatedData.email,
      validatedData.password
    );
    if (!claimed) {
      return { status: "closed" } as RegisterActionState;
    }
    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};
