import type { Metadata } from "next";
import React from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignInCard } from "@/components/auth/SignInCard";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

type SignInPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { redirect } = await searchParams;

  return (
    <AuthLayout>
      <SignInCard redirect={redirect} />
    </AuthLayout>
  );
}
