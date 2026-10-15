import React from 'react';
import { cn } from '@/lib/cn';
import { Check } from 'lucide-react';

interface OnboardingStepperProps {
  currentStep: number;
}

const STEPS = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'Profile' },
  { id: 3, label: 'Region' },
  { id: 4, label: 'Titles' },
];

export function OnboardingStepper({ currentStep }: OnboardingStepperProps) {
  return (
    <div className="flex items-center justify-center w-full">
      <div className="flex items-center space-x-2 sm:space-x-4 bg-card/50 backdrop-blur-sm border border-border/50 rounded-full px-6 py-3">
        {STEPS.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          const isLast = index === STEPS.length - 1;

          return (
            <div key={step.id} className="flex items-center">
              <div className={cn("flex items-center gap-2", 
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                <div className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium border",
                  isActive 
                    ? "bg-foreground text-background border-foreground" 
                    : isCompleted
                      ? "bg-primary text-white border-primary"
                      : "bg-transparent border-muted-foreground/30 text-muted-foreground"
                )}>
                  {isCompleted ? <Check size={10} strokeWidth={3} /> : step.id}
                </div>
                <span className={cn(
                  "text-xs font-medium hidden sm:inline-block",
                   isActive ? "opacity-100" : "opacity-60"
                )}>
                  {step.label}
                </span>
              </div>
              
              {!isLast && (
                <div className="w-4 sm:w-8 h-[1px] bg-border mx-2 sm:mx-4" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
