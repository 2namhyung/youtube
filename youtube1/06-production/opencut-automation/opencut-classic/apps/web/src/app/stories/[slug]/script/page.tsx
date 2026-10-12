import { GenericPipelineWorkbench } from "@/app/newsroom/[slug]/generic-pipeline-workbench";
import { NewsroomShell } from "@/app/newsroom/newsroom-shell";
import { ProductionScriptDesk } from "@/components/newsroom/production-script-desk";
import { loadProductionScriptDesk } from "@/newsroom/production-script-desk";
import { readProjectContext } from "@/newsroom/project-runtime";

export const dynamic = "force-dynamic";

export default async function StoryScriptPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ mode?: string }> }) {
	const { slug } = await params;
	const [project, productionDesk, query] = await Promise.all([readProjectContext(slug), loadProductionScriptDesk(slug), searchParams]);
	if (productionDesk && query.mode !== "workflow") return <NewsroomShell activeStep={2} projectSlug={slug} caseTitle={project.title}><ProductionScriptDesk initialState={productionDesk} /></NewsroomShell>;
	if (productionDesk && query.mode === "workflow") return <GenericPipelineWorkbench slug={slug} stageNumber="03" productionAuthority={{ path: productionDesk.authority.path, draftSha256: productionDesk.authority.draftSha256 }} />;
	return <GenericPipelineWorkbench slug={slug} stageNumber="03" />;
}
