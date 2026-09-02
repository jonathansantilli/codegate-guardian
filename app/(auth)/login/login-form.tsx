"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { SubmitButton } from "@/components/auth/submit-button";
import { toast } from "@/components/auth/toast";
import { type LoginActionState, login } from "../actions";

/**
 * The sign-in form. Whether to offer sign-up is a server read (has anybody
 * claimed this instance?), so that part arrives as a node from the page.
 */
export function LoginForm({ signUpLink }: { signUpLink: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "failed") {
      toast({
        type: "error",
        description: "That email and password do not match.",
      });
    } else if (state.status === "rate_limited") {
      toast({
        type: "error",
        description:
          "Too many sign-in attempts. Wait a few minutes and try again.",
      });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description:
          "Enter an email address and a password of at least 6 characters.",
      });
    } else if (state.status === "success") {
      setIsSuccessful(true);
      updateSession();
      router.refresh();
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted-foreground">
        Sign in to your account to continue
      </p>
      <AuthForm action={handleSubmit} defaultEmail={email}>
        <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
        {signUpLink}
      </AuthForm>
    </>
  );
}
