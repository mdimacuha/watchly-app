import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PATHS } from "@/lib/app";

export default function DocsIndexPage() {
  const docs = [
    {
      title: "Design System",
      description: "Core design tokens, colors, typography, and spacing.",
      href: PATHS.INTERNAL.DOCS.DESIGN_SYSTEM,
    },
    {
      title: "Component Playground",
      description: "Interactive demo of core components and states.",
      href: PATHS.INTERNAL.DOCS.COMPONENT_PLAYGROUND,
    },
    {
      title: "Responsive Guidelines",
      description: "Breakpoints, grid behavior, and adaptation rules.",
      href: PATHS.INTERNAL.DOCS.RESPONSIVE_GUIDELINES,
    },
    {
      title: "Top Notice Bar",
      description: "System-wide alerts, announcements, and status updates.",
      href: PATHS.INTERNAL.DOCS.TOP_NOTICE_BAR,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-4xl px-6 py-16 space-y-8">
        <div className="space-y-2">
          <h1 className="text-h1">Documentation</h1>
          <p className="text-body-lg text-muted-foreground">
            Watchly V2 design system and component references.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {docs.map((doc) => (
            <Link key={doc.href} href={doc.href} className="block group">
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-secondary/20">
                <CardHeader>
                  <CardTitle className="group-hover:text-primary transition-colors">
                    {doc.title}
                  </CardTitle>
                  <CardDescription>{doc.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
