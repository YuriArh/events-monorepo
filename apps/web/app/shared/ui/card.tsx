"use client";

/*
 * The vendored Card (components/ui, not hand-edited) uses React context but
 * has no "use client", so a Server Component can't render it directly. This
 * re-export marks it as a client boundary, the documented pattern for
 * third-party components without the directive.
 */
import { Card, CardContent } from "@/components/ui/card";

export { Card, CardContent };
