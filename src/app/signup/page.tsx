import type { Metadata } from "next";
import React from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignUpCard } from "@/components/auth/SignUpCard";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <AuthLayout>
      <SignUpCard />
    </AuthLayout>
  );
}
