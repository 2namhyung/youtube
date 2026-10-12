import CanonicalEditorRoute from "@/app/newsroom/[slug]/assets/page";
import { GenericPipelineWorkbench } from "@/app/newsroom/[slug]/generic-pipeline-workbench";
import { isCanonicalNewsroomProject } from "@/newsroom/project-runtime";

export const dynamic = "force-dynamic";

export default async function StoryEditorPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	if (await isCanonicalNewsroomProject(slug)) return <CanonicalEditorRoute params={Promise.resolve({ slug })} />;
	return <GenericPipelineWorkbench slug={slug} stageNumber="06" />;
}
