'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-transparent text-foreground flex flex-col relative overflow-hidden">
      {/* Background Gradient Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)] z-0" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header / Logo */}
      <header className="relative z-10 w-full p-6 flex justify-center items-center">
        <Link href="/" className="flex items-center gap-2 group w-fit">
          <Image
            src="/brand-light.svg"
            alt="Watchly Logo"
            width={32}
            height={32}
            className="w-auto h-auto"
          />
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10 flex items-center justify-center p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
