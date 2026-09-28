import { RiArrowRightUpLine, RiMoonLine, RiSunLine, RiWebhookLine } from "@remixicon/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/theme-provider";

export function App() {
  const { theme, setTheme } = useTheme();
  const [clicked, setClicked] = useState(false);

  return (
    <main className="min-h-svh bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-16 flex items-center justify-between">
          <div className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <RiWebhookLine className="size-5" aria-hidden="true" />
            </span>
            DeliveryKit
          </div>
          <Button
            aria-label="Toggle color theme"
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <RiSunLine /> : <RiMoonLine />}
          </Button>
        </header>

        <section className="mb-10 max-w-2xl">
          <Badge variant="secondary" className="mb-5">
            Frontend preview
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            Webhook delivery, with a clearer view.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            A small preview of the new DeliveryKit interface. This screen shows the selected theme
            and components while the app takes shape.
          </p>
        </section>

        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Component preview</CardTitle>
              <CardDescription>Blue accents, soft surfaces, and rounded controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Active</Badge>
                <Badge variant="outline">Pending</Badge>
                <Badge variant="secondary">Delivered</Badge>
              </div>
              <div className="space-y-2">
                <label htmlFor="demo-endpoint" className="text-sm font-medium">
                  Endpoint URL
                </label>
                <Input id="demo-endpoint" type="url" defaultValue="https://example.com/webhook" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setClicked(true)}>
                  {clicked ? "Looks good" : "Try a button"}
                  <RiArrowRightUpLine data-icon="inline-end" />
                </Button>
                <Button variant="outline" onClick={() => setClicked(false)}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle>What&apos;s connected</CardTitle>
              <CardDescription>The frontend is served by the API on the same port.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <span>Application</span>
                  <Badge variant="outline">React SPA</Badge>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <span>Routing</span>
                  <Badge variant="outline">TanStack Router</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>UI</span>
                  <Badge variant="outline">shadcn/ui</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default App;
