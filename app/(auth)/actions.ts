"use server";

import { z } from "zod";

import { createFirstUser, createUser, getUser } from "@/lib/db/queries";

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

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }

    // The first account bootstraps the instance; after that, creating one is
    // an operator's job. Left open, reaching the port was one POST away from
    // full console authority — every machine, the fleet export, and minting
    // enrolment codes.
    //
    // The check lives here rather than in the proxy's public-path list: a
    // server action is dispatched by its id, not by the path it was posted
    // to, so it can be invoked through any public route.
    const { auth } = await import("./auth");
    const session = await auth();

    if (session?.user) {
      await createUser(validatedData.email, validatedData.password);
    } else {
      const claimed = await createFirstUser(
        validatedData.email,
        validatedData.password
      );
      if (!claimed) {
        return { status: "closed" } as RegisterActionState;
      }
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
