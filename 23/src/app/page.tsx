import { getPoliticians, getRecords } from '@/lib/db';
import Workspace from '@/components/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function Home() {
  const politicians = getPoliticians();
  const records = getRecords();
  return <Workspace initialPoliticians={politicians} initialRecords={records} />;
}
