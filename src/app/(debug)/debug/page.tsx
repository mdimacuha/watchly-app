import Link from 'next/link';

function DebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-5xl px-6 py-16 space-y-20">
        <h1 className="text-h1">Debug</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/debug/auth">
            Auth (Check user signed in session details)
          </Link>
          <Link href="/debug/user">
            User Details (Check user details from database)
          </Link>
          <Link href="/debug/emails">
            Email Templates (Preview every transactional + marketing email)
          </Link>
          <Link href="/debug/maintenance">
            Maintenance Mode (Toggle the full-app down screen + audit log)
          </Link>
        </div>
      </div>
    </div>
  );
}

export default DebugPage;
