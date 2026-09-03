"use client";

import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ParentLoginForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/parent/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessCode: form.get("accessCode"),
          pin: form.get("pin"),
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "The details could not be verified.");
        messageRef.current?.focus();
        return;
      }
      window.location.assign("/parent");
    } catch {
      setMessage("The details could not be verified. Try again shortly.");
      messageRef.current?.focus();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={submit}
      aria-describedby="parent-privacy-guidance"
    >
      {message ? (
        <div ref={messageRef} tabIndex={-1}>
          <Alert title="Unable to sign in" variant="warning">
            {message}
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="parent-access-code">Access code</Label>
        <Input
          id="parent-access-code"
          name="accessCode"
          type="text"
          required
          maxLength={35}
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
        />
        <p className="text-muted-foreground text-xs leading-5">
          Spaces and separators are accepted.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="parent-pin">PIN</Label>
        <Input
          id="parent-pin"
          name="pin"
          type="password"
          required
          minLength={8}
          maxLength={8}
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="8-digit PIN"
        />
        <p className="text-muted-foreground text-xs leading-5">
          Keep this PIN private. The school cannot recover a displayed PIN.
        </p>
      </div>
      <Button
        className="w-full"
        type="submit"
        loading={pending}
        loadingLabel="Verifying"
      >
        Sign in securely
      </Button>
    </form>
  );
}
