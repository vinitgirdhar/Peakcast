import { Component, Suspense, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { EmptyState, SkeletonRows } from "../ui.js";
import { microApps } from "./registry.js";
import type { MicroAppProps } from "./types.js";
import "./micro.css";

interface BoundaryProps {
  onRetry: () => void;
  children: ReactNode;
}

/** One crashing app never takes down the shell. */
class MicroErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        title="This app could not open."
        text="Something went wrong inside it. Your other data is safe."
        action={
          <button className="primary-button" onClick={this.props.onRetry}>
            Try again
          </button>
        }
      />
    );
  }
}

export function MicroHost({
  appId,
  ...props
}: MicroAppProps & { appId: string }) {
  const [attempt, setAttempt] = useState(0);
  const app = microApps.find((item) => item.id === appId);
  if (!app)
    return (
      <EmptyState
        title="App not found"
        text="This micro app does not exist on this device."
        action={
          <button
            className="primary-button"
            onClick={() => props.navigate("/apps")}
          >
            All micro apps
          </button>
        }
      />
    );
  const App = app.component;
  return (
    <div className={`page micro-page micro-${app.id}`}>
      <button className="micro-back" onClick={() => props.navigate("/apps")}>
        <ChevronLeft size={18} aria-hidden="true" />
        Micro apps
      </button>
      <div className="page-heading">
        <div>
          <h1>{app.name}</h1>
          <p>{app.tagline}</p>
        </div>
      </div>
      <MicroErrorBoundary
        key={attempt}
        onRetry={() => setAttempt((value) => value + 1)}
      >
        <Suspense fallback={<SkeletonRows label="Opening app" />}>
          <App {...props} />
        </Suspense>
      </MicroErrorBoundary>
      <p className="fine-print micro-footer">
        Practice tool. Peakcast uses practice credits only; nothing here is
        financial advice.
      </p>
    </div>
  );
}
