import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ScriptPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	redirect(`/stories/${encodeURIComponent(slug)}/script`);
}
