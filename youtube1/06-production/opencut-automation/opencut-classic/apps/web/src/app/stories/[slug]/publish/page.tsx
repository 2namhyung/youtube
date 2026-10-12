import { GenericPipelineWorkbench } from "@/app/newsroom/[slug]/generic-pipeline-workbench";
import { NewsroomShell } from "@/app/newsroom/newsroom-shell";
import { PublishingDesk } from "@/app/newsroom/[slug]/pipeline/[stage]/publishing-desk";
import { QualityDesk } from "@/app/newsroom/[slug]/pipeline/[stage]/quality-desk";
import { readProjectContext } from "@/newsroom/project-runtime";

export const dynamic = "force-dynamic";

export default async function StoryPublishPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const project = await readProjectContext(slug);
	if (project.canonical) return <NewsroomShell activeStep={7} projectSlug={slug} caseTitle={project.title}><QualityDesk slug={slug} /><PublishingDesk slug={slug} /></NewsroomShell>;
	return <GenericPipelineWorkbench slug={slug} stageNumber="08" />;
}
