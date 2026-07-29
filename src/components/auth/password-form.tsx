"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeInvitationAction,
  resetPasswordAction,
} from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/schemas";

type PasswordFields = {
  password: string;
  confirmPassword: string;
};

export function PasswordForm({ mode }: { mode: "invitation" | "recovery" }) {
  const action =
    mode === "invitation" ? completeInvitationAction : resetPasswordAction;
  const [state, dispatch] = useActionState(action, initialAuthActionState);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
  } = useForm<PasswordFields>();

  const submit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);
    startTransition(() => dispatch(formData));
  });

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password || state.fieldErrors?.password)}
          {...register("password", {
            required: "Enter a new password.",
            minLength: { value: 12, message: "Use at least 12 characters." },
            maxLength: {
              value: 128,
              message: "Use no more than 128 characters.",
            },
          })}
        />
        <p className="text-danger text-xs" role="alert">
          {errors.password?.message ?? state.fieldErrors?.password?.[0]}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(
            errors.confirmPassword || state.fieldErrors?.confirmPassword,
          )}
          {...register("confirmPassword", {
            required: "Confirm your new password.",
            validate: (value) =>
              value === getValues("password") || "Passwords do not match.",
          })}
        />
        <p className="text-danger text-xs" role="alert">
          {errors.confirmPassword?.message ??
            state.fieldErrors?.confirmPassword?.[0]}
        </p>
      </div>
      <Button
        className="w-full"
        type="submit"
        loading={isPending}
        loadingLabel="Saving password"
      >
        {mode === "invitation" ? "Activate staff account" : "Update password"}
      </Button>
      {state.message ? (
        <Alert title="Unable to continue" variant="warning">
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
