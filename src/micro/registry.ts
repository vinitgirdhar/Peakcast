// The micro-app manifest: the host renders whatever is listed here.
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Calculator, NotebookPen, Scale, type LucideIcon } from "lucide-react";
import type { MicroAppProps } from "./types.js";

export interface MicroApp {
  /** /^[a-z][a-z0-9-]{1,23}$/, also the storage id. */
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType<MicroAppProps>>;
}

// ponytail: in-bundle registry; add iframe sandboxing only if third-party apps are ever accepted.
export const microApps: readonly MicroApp[] = [
  {
    id: "journal",
    name: "Forecast journal",
    tagline: "Log your probabilities and see how calibrated you are",
    icon: NotebookPen,
    component: lazy(() => import("./journal/Journal.js")),
  },
  {
    id: "sizer",
    name: "Stake sizer",
    tagline: "Kelly sizing for practice credits",
    icon: Calculator,
    component: lazy(() => import("./sizer/Sizer.js")),
  },
  {
    id: "bayes",
    name: "Evidence updater",
    tagline: "Update a probability with Bayes' rule",
    icon: Scale,
    component: lazy(() => import("./bayes/Bayes.js")),
  },
];
