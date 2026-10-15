'use client';

import React, { ReactNode } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { OnboardingStepper } from './OnboardingStepper';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface OnboardingShellProps {
  children: ReactNode;
  step: number;
  title: string;
  description?: string;
  footer?: ReactNode;
  className?: string;
}

export function OnboardingShell({ 
  children, 
  step, 
  title, 
  description,
  footer,
  className 
}: OnboardingShellProps) {
  return (
    <AuthLayout>
      <div className="w-full max-w-[500px] flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-500">
        <OnboardingStepper currentStep={step} />
        
        <Card className={cn("border-border/50 shadow-xl shadow-black/20", className)}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>
            {children}
          </CardContent>
          {footer && (
            <CardFooter className="flex justify-between items-center border-t border-border/50 bg-secondary/20 rounded-b-xl px-6 py-4">
              {footer}
            </CardFooter>
          )}
        </Card>
      </div>
    </AuthLayout>
  );
}
