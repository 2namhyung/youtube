import { renderPipelineStage } from "./[stage]/page";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ stage?: string }> }) {
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	return renderPipelineStage({ slug, stageNumber: query.stage || "02" });
}
