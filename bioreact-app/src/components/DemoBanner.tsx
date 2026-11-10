/**
 * DemoBanner.tsx — says plainly what the published page is.
 *
 * Everything on screen in the demo came out of the real pipeline; what it
 * cannot do is start a new run. Saying so once, at the top, is better
 * than letting someone press Run and meet an error — and better than
 * hiding the controls, which would misrepresent what the tool does.
 */
import { ExternalLink } from 'lucide-react';
import { demoManifest } from '../api';

const REPOSITORY =
  'https://github.com/ameliamcalister/bioREACT-Drug-design-and-manufacturability';

export function DemoBanner() {
  const manifest = demoManifest();

  return (
    <div className="border-b border-line bg-accent-soft">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2 text-[12px] leading-snug">
        <span className="font-semibold text-ink">
          A recorded run
          {manifest?.target ? ` against ${manifest.target}` : ''}
        </span>
        <span className="text-ink-2">
          Every structure, pose, verdict and cost here came out of the real pipeline
          {manifest?.generated_at ? ` on ${manifest.generated_at}` : ''}. Starting a new run
          needs RDKit, AutoDock Vina and an API key on your own machine.
        </span>
        <a
          href={REPOSITORY}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent underline-offset-2 hover:underline"
        >
          Run it yourself
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/** The one-line version, shown where a control would otherwise be live. */
export function DemoNotice({ action }: { action: string }) {
  return (
    <p className="rounded-[5px] border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-2">
      <span className="font-medium text-ink">{action} is disabled in this demo.</span>{' '}
      The page is a recorded run with no computation behind it. Clone the repository and
      run <code className="font-mono text-[11px]">./start.sh</code> to use the live tool —
      everything else on this page works exactly as it does there.
    </p>
  );
}
