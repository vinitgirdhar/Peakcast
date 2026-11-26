import {
  ArrowLeft,
  Download,
  HardDrive,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

/** What Peakcast is, where its data lives and how to install it. Opens from Settings. */
export function About({
  canInstall,
  onInstall,
  onBack,
}: {
  canInstall: boolean;
  onInstall: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <div className="page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Settings
      </button>
      <div className="page-heading">
        <div>
          <h1>About Peakcast</h1>
          <p>Practice forecasting. Everything stays on your device.</p>
        </div>
      </div>
      <div className="developer-notes">
        <section>
          <ShieldCheck size={23} />
          <h3>A practice app</h3>
          <p>
            Trade sample markets and your own with demo credits. There are no
            deposits, withdrawals or real-money payouts.
          </p>
        </section>
        <section>
          <HardDrive size={23} />
          <h3>Your data stays here</h3>
          <p>
            Peakcast has no server. Your account, credits, trades and drafts are
            saved on this device only and work offline. Clearing the app’s
            storage or uninstalling it erases them, and other devices cannot see
            them.
          </p>
        </section>
        <section>
          <Smartphone size={23} />
          <h3>Install Peakcast</h3>
          <p>
            On iPhone, open Safari’s Share menu and choose Add to Home Screen.
            On Android, install the Peakcast app or use your browser’s Install
            app option.
          </p>
          {canInstall && (
            <button className="text-button" onClick={() => void onInstall()}>
              <Download size={15} />
              Install Peakcast
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
