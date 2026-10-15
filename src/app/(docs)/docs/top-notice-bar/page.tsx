'use client';

import React from 'react';
import { TopNoticeBar } from '@/components/system/TopNoticeBar';
import { AccountConfirmationNotice } from '@/components/system/AccountConfirmationNotice';
import { Info, Sparkles, XCircle, WifiOff, Calendar, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function TopNoticeBarPlayground() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="space-y-12">
        {/* Section 1: Top Notification Bar (The requested demo) */}
        <section>
          <div className="px-6 py-8 border-b border-border">
            <Link href="/docs">
              <Button
                variant="ghost"
                size="sm"
                className="mb-4 -ml-4 gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Docs
              </Button>
            </Link>
            <h1 className="text-3xl font-bold mb-2">Top Notification Bar</h1>
            <p className="text-muted-foreground">
              System-wide alerts, announcements, and status updates.
            </p>
          </div>

          <div className="mt-8 space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 mb-4">
              Live Sample: Account Confirmation
            </h2>
            {/* The AccountConfirmationNotice is designed to be sticky, but in this demo context we want to show it inline */}
            <div className="relative border-y border-border/50">
              <AccountConfirmationNotice />
              <div className="h-32 flex items-center justify-center bg-card/20 text-muted-foreground text-sm italic">
                (Page content starts here)
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: All Variants */}
        <section className="px-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6">
            All Variants
          </h2>
          <div className="space-y-4 max-w-4xl">
            {/* Info Variant */}
            <TopNoticeBar
              variant="info"
              icon={<Info className="w-4 h-4 text-blue-400" />}
              title="Update available."
              message="A new version of Watchly is available."
              action={{
                label: 'Refresh',
                onClick: () => alert('Refreshing...'),
              }}
              dismissible
              sticky={false}
              className="rounded-md border"
            />

            {/* Accent Variant */}
            <TopNoticeBar
              variant="accent"
              icon={<Sparkles className="w-4 h-4 text-primary" />}
              title="Pro Feature."
              message="Create unlimited shareable watchlists with Watchly Pro."
              action={{
                label: 'Learn more',
                onClick: () => alert('Learn more clicked'),
              }}
              dismissible
              sticky={false}
              className="rounded-md border"
            />

            {/* Warning Variant (Generic) */}
            <TopNoticeBar
              variant="warning"
              icon={<XCircle className="w-4 h-4 text-amber-500" />}
              title="Payment failed."
              message="Please update your billing method to keep your subscription active."
              action={{
                label: 'Update',
                onClick: () => alert('Update clicked'),
              }}
              dismissible
              sticky={false}
              className="rounded-md border"
            />

            {/* Error Variant */}
            <TopNoticeBar
              variant="error"
              icon={<WifiOff className="w-4 h-4 text-red-400" />}
              message="No internet connection. Check your network settings."
              sticky={false}
              className="rounded-md border"
            />
          </div>
        </section>

        {/* Section 3: Stacking Behavior */}
        <section className="px-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6">
            Stacking Behavior
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Multiple notifications stack vertically without gaps.
          </p>

          <div className="max-w-4xl rounded-lg overflow-hidden border border-border">
            <TopNoticeBar
              variant="warning"
              icon={<AlertTriangleIcon />}
              message="Email not verified."
              dismissible
              sticky={false}
              className="border-x-0 border-t-0"
            />
            <TopNoticeBar
              variant="info"
              icon={<Calendar className="w-4 h-4" />}
              message="Maintenance scheduled. Watchly will be offline on Sunday from 2am-4am."
              dismissible
              sticky={false}
              className="border-0"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-amber-500"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  );
}
