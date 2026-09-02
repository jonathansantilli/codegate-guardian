"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { SubmitButton } from "@/components/auth/submit-button";
import { toast } from "@/components/auth/toast";
import { type RegisterActionState, register } from "../actions";

export function RegisterForm({
  setupTokenField,
}: {
  setupTokenField: React.ReactNode;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "closed") {
      toast({
        type: "error",
        description:
          "This console already has an operator, and this version has exactly one. Sign in instead.",
      });
    } else if (state.status === "setup_token_missing") {
      toast({
        type: "error",
        description:
          "This console cannot be claimed: no SETUP_TOKEN is configured. Set one and restart it.",
      });
    } else if (state.status === "bad_setup_token") {
      toast({ type: "error", description: "That setup token is not correct." });
    } else if (state.status === "user_exists") {
      toast({ type: "error", description: "Account already exists!" });
    } else if (state.status === "failed") {
      toast({ type: "error", description: "Failed to create account!" });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      });
    } else if (state.status === "success") {
      // Rarely reached: on success the action redirects to /fleet itself, and
      // this form is unmounted by the re-render. Kept for the case where the
      // redirect is not followed.
      toast({ type: "success", description: "Account created!" });
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
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="text-sm text-muted-foreground">
        Claim this console as its operator
      </p>
      <AuthForm
        action={handleSubmit}
        defaultEmail={email}
        passwordAutoComplete="new-password"
        setupTokenField={setupTokenField}
      >
        <SubmitButton isSuccessful={isSuccessful}>Sign up</SubmitButton>
        <p className="text-center text-[13px] text-muted-foreground">
          {"Have an account? "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href="/login"
          >
            Sign in
          </Link>
        </p>
      </AuthForm>
    </>
  );
}
