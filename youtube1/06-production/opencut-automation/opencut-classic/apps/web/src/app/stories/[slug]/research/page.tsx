import CanonicalResearchRoute from "@/app/newsroom/[slug]/page";
import { PromotedDossierPage } from "@/app/newsroom/[slug]/promoted-dossier-page";
import { isCanonicalNewsroomProject } from "@/newsroom/project-runtime";

export const dynamic = "force-dynamic";

export default async function StoryResearchPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	if (await isCanonicalNewsroomProject(slug)) return <CanonicalResearchRoute params={Promise.resolve({ slug })} />;
	return <PromotedDossierPage slug={slug} />;
}
