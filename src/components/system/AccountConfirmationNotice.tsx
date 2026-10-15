'use client';

import React from 'react';
import { TopNoticeBar } from './TopNoticeBar';
import { AlertTriangle } from 'lucide-react';

export function AccountConfirmationNotice() {
  const handleResendCode = () => {
    console.log('Resending verification code...');
    // Add actual logic here
  };

  const handleEnterCode = () => {
    console.log('Opening enter code dialog...');
    // Add actual logic here
  };

  return (
    <TopNoticeBar
      variant="warning"
      icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
      title="Confirm your account."
      message="Please verify your email address to unlock sharing features."
      action={{
        label: "Resend code",
        onClick: handleResendCode
      }}
      secondaryAction={{
        label: "Enter code",
        onClick: handleEnterCode
      }}
      dismissible={true}
      onDismiss={() => console.log('Notice dismissed')}
    />
  );
}
