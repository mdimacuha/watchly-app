import React from 'react';
import { cn } from '@/lib/cn';

interface StepperProps {
  currentStep: number;
  steps: string[];
}

export function Stepper({ currentStep, steps }: StepperProps) {
  return (
    <div className="flex items-center justify-center space-x-2 mb-6">
      {steps.map((_, index) => (
        <React.Fragment key={index}>
          <div
            className={cn(
              "h-2 w-2 rounded-full transition-colors duration-300",
              index + 1 <= currentStep ? "bg-primary" : "bg-secondary"
            )}
          />
          {index < steps.length - 1 && (
            <div className={cn("h-[1px] w-8 transition-colors duration-300",
               index + 1 < currentStep ? "bg-primary" : "bg-secondary"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
