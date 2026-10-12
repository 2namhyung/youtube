import { redirect } from "next/navigation";

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	redirect(`/stories/${encodeURIComponent(slug)}/research`);
}
