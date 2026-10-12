import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { fallbackRenderPath, getLatestRender, hasExplicitRegistry } from "../registry";

export const runtime = "nodejs";

function parseRange({ range, fileSize }: { range: string; fileSize: number }) {
	const match = /^bytes=(\d*)-(\d*)$/.exec(range);
	if (!match) return null;

	const rawStart = match[1];
	const rawEnd = match[2];
	if (!rawStart && !rawEnd) return null;
	let start: number;
	let end: number;

	if (!rawStart && rawEnd) {
		const suffixLength = Number(rawEnd);
		if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
		start = Math.max(fileSize - suffixLength, 0);
		end = fileSize - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd ? Number(rawEnd) : fileSize - 1;
	}

	if (
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		end < start ||
		start >= fileSize
	) {
		return null;
	}

	return { start, end: Math.min(end, fileSize - 1) };
}

function streamFile({
	filePath,
	start,
	end,
}: {
	filePath: string;
	start?: number;
	end?: number;
}) {
	const stream = createReadStream(filePath, { start, end });
	return new ReadableStream<Uint8Array>({
		start(controller) {
			stream.on("data", (chunk) => {
				const bytes =
					typeof chunk === "string"
						? new TextEncoder().encode(chunk)
						: new Uint8Array(
								chunk.buffer,
								chunk.byteOffset,
								chunk.byteLength,
							);
				controller.enqueue(bytes);
			});
			stream.on("end", () => controller.close());
			stream.on("error", (error) => controller.error(error));
		},
		cancel() {
			stream.destroy();
		},
	});
}

export async function GET(request: NextRequest) {
	const requestedVersion = request.nextUrl.searchParams.get("versionId");
	const latest = await getLatestRender(requestedVersion ?? undefined);
	if (!latest && requestedVersion !== null) return Response.json({ error: "Requested render version is not available." }, { status: 404 });
	if (!latest && hasExplicitRegistry()) return Response.json({ error: "Configured render registry is invalid or unavailable." }, { status: 503 });
	const filePath = latest?.videoPath || fallbackRenderPath();
	if (!filePath) return Response.json({ error: "No registered render is available." }, { status: 404 });
	const fileName = latest?.metadata.fileName || path.basename(filePath);

	try {
		const file = await stat(filePath);
		const headers = new Headers({
			"Accept-Ranges": "bytes",
			"Cache-Control": "no-store",
			"Content-Type": "video/mp4",
			"Content-Disposition": `inline; filename="${fileName}"`,
		});
		const requestedRange = request.headers.get("range");

		if (!requestedRange) {
			headers.set("Content-Length", String(file.size));
			return new Response(streamFile({ filePath }), { status: 200, headers });
		}

		const range = parseRange({ range: requestedRange, fileSize: file.size });
		if (!range) {
			headers.set("Content-Range", `bytes */${file.size}`);
			return new Response(null, { status: 416, headers });
		}

		headers.set(
			"Content-Range",
			`bytes ${range.start}-${range.end}/${file.size}`,
		);
		headers.set("Content-Length", String(range.end - range.start + 1));
		return new Response(
			streamFile({ filePath, start: range.start, end: range.end }),
			{ status: 206, headers },
		);
	} catch {
		return Response.json(
			{
				error: "Final render is not available.",
				expectedFile: fileName,
			},
			{ status: 404 },
		);
	}
}
