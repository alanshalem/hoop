import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { ManualView } from '@/presentation/organisms/ManualView/ManualView';
import { renderManual } from '@/presentation/organisms/ManualView/render-manual';
import { ScreenTour } from '@/presentation/tour/ScreenTour';
import { TourReplayButton } from '@/presentation/tour/TourReplayButton';

export const metadata: Metadata = {
  title: 'Ayuda',
};

/**
 * In-app manual (S11). docs/MANUAL.md is the single source: a synchronous read
 * completes during prerendering, so the page ships as static HTML and keeps
 * working offline once loaded.
 */
export default function HelpPage() {
  const manual = renderManual(readFileSync(join(process.cwd(), 'docs', 'MANUAL.md'), 'utf8'));

  return (
    <TabletAppShell>
      <ManualView manual={manual} actions={<TourReplayButton />} />
      <ScreenTour tourId="help" />
    </TabletAppShell>
  );
}
