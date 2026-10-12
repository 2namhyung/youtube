import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, mkdir, open, readFile, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

type LockRecord = { token?: unknown; pid?: unknown; processInstanceId?: unknown; processStartedAt?: unknown; expiresAt?: unknown; heartbeatAt?: unknown; lockIdentity?: unknown; lockRawHash?: unknown };
type Observation = { raw: string; record: LockRecord; parsed: boolean; ino: number; mtimeMs: number };
type ProcessIdentity = { state: "alive"; startedAt: string } | { state: "dead" } | { state: "unknown" };
type AcquireFaultHooks = {
	gateWaitMs?: number;
	heartbeatIntervalMs?: number;
	afterGatePrecheck?: (lockPath: string) => Promise<void>;
	afterMainPublish?: (lockPath: string) => Promise<void>;
	beforeMainQuarantine?: (lockPath: string) => Promise<void>;
	beforeQuarantineRename?: (file: string) => Promise<void>;
	beforeHeartbeatCleanupObserve?: (file: string) => Promise<void>;
	beforeOwnProcessIdentityLookup?: (attempt: number) => Promise<void>;
	lookupProcessIdentity?: (pid: number) => Promise<ProcessIdentity>;
};
export type ProjectMutationLock = { lockPath: string; token: string; ownerRaw: string; ownerIno: number; heartbeatPath: string; faultHooks?: AcquireFaultHooks };

const PARTIAL_GRACE_MS = 1_000;
const GATE_WAIT_MS = 5_000;
const ARTIFACT_GRACE_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const PROCESS_INSTANCE_ID = randomUUID();
const execFileAsync = promisify(execFile);
let ownProcessIdentityPromise: Promise<string> | null = null;
const activeTokens = new Set<string>();
type HeartbeatLease = { references: number; ready: Promise<void>; timer?: ReturnType<typeof setInterval>; lastError: unknown };
const heartbeatLeases = new Map<string, HeartbeatLease>();

function parseLockRecord(serialized: string): LockRecord {
	const value: unknown = JSON.parse(serialized);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Lock record must be an object");
	return {
		token: "token" in value ? value.token : undefined,
		pid: "pid" in value ? value.pid : undefined,
		processInstanceId: "processInstanceId" in value ? value.processInstanceId : undefined,
		processStartedAt: "processStartedAt" in value ? value.processStartedAt : undefined,
		expiresAt: "expiresAt" in value ? value.expiresAt : undefined,
		heartbeatAt: "heartbeatAt" in value ? value.heartbeatAt : undefined,
		lockIdentity: "lockIdentity" in value ? value.lockIdentity : undefined,
		lockRawHash: "lockRawHash" in value ? value.lockRawHash : undefined,
	};
}

function processIsAlive(pid: number) {
	if (!Number.isInteger(pid) || pid < 1) return false;
	try { process.kill(pid, 0); return true; }
	catch (error) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "EPERM"); }
}

async function lookupProcessIdentity(pid: number): Promise<ProcessIdentity> {
	if (!Number.isInteger(pid) || pid < 1 || !processIsAlive(pid)) return { state: "dead" };
	try {
		if (process.platform === "win32") {
			const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
			const powershell = path.join(windowsRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
			const script = `[Console]::Out.Write((Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks)`;
			const { stdout } = await execFileAsync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
				encoding: "utf8", env: { NODE_ENV: process.env.NODE_ENV ?? "production", SystemRoot: windowsRoot, WINDIR: windowsRoot }, maxBuffer: 4_096, timeout: 3_000, windowsHide: true,
			});
			const ticks = stdout.trim();
			if (!/^\d{12,20}$/u.test(ticks)) return { state: "unknown" };
			return { state: "alive", startedAt: `windows-filetime:${ticks}` };
		}
		const statText = await readFile(`/proc/${pid}/stat`, "utf8");
		const close = statText.lastIndexOf(")");
		const fields = close >= 0 ? statText.slice(close + 2).trim().split(/\s+/u) : [];
		const startTicks = fields[19];
		if (!startTicks || !/^\d+$/u.test(startTicks)) return { state: "unknown" };
		return { state: "alive", startedAt: `proc-start-ticks:${startTicks}` };
	} catch {
		return processIsAlive(pid) ? { state: "unknown" } : { state: "dead" };
	}
}

async function ownProcessStartedAt({ beforeLookup }: { beforeLookup?: (attempt: number) => Promise<void> } = {}) {
	if (ownProcessIdentityPromise) return ownProcessIdentityPromise;
	const pending = (async () => {
		let lastError: unknown = null;
		for (let attempt = 1; attempt <= 2; attempt += 1) {
			try {
				await beforeLookup?.(attempt);
				const identity = await lookupProcessIdentity(process.pid);
				if (identity.state !== "alive") throw new Error("Could not determine the current process birth identity for project mutation fencing");
				return identity.startedAt;
			} catch (cause) {
				lastError = cause;
				if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
			}
		}
		throw lastError instanceof Error ? lastError : new Error("Could not determine the current process birth identity for project mutation fencing");
	})();
	ownProcessIdentityPromise = pending;
	try { return await pending; }
	catch (cause) { if (ownProcessIdentityPromise === pending) ownProcessIdentityPromise = null; throw cause; }
}

function siblingPath({ lockPath, suffix }: { lockPath: string; suffix: string }) {
	const parent = path.dirname(lockPath);
	const candidate = path.resolve(parent, `${path.basename(lockPath)}.${suffix}`);
	if (path.dirname(candidate) !== parent) throw new Error("Project lock quarantine escapes its directory");
	return candidate;
}

function recordIsAbandonedSameInstance(record: LockRecord) {
	return record.processInstanceId === PROCESS_INSTANCE_ID && typeof record.token === "string" && !activeTokens.has(record.token);
}

async function observe(file: string): Promise<Observation> {
	const [raw, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
	let record: LockRecord = {}; let parsed = false;
	try { record = parseLockRecord(raw); parsed = true; } catch { /* partial/corrupt record */ }
	return { raw, record, parsed, ino: info.ino, mtimeMs: info.mtimeMs };
}

function sameObservation({ left, right }: { left: Observation; right: Observation }) {
	return left.raw === right.raw && (left.ino === 0 || right.ino === left.ino);
}

function observationIdentity(observed: Observation) {
	return createHash("sha256").update(`${observed.raw}\0${observed.ino}\0${observed.mtimeMs}`).digest("hex");
}

function heartbeatPathFor({ lockPath, processInstanceId }: { lockPath: string; processInstanceId: string }) {
	if (!/^[a-f0-9-]{16,80}$/iu.test(processInstanceId)) throw new Error("Invalid project mutation process-instance identity");
	return siblingPath({ lockPath, suffix: `instance-${processInstanceId}.heartbeat` });
}

function abandonmentPathFor({ file, observed }: { file: string; observed: Observation }) {
	return siblingPath({ lockPath: file, suffix: `abandoned-${observationIdentity(observed).slice(0, 32)}` });
}

async function publishExclusive({ file, serialized }: { file: string; serialized: string }) {
	const temporary = siblingPath({ lockPath: file, suffix: `publish-${process.pid}-${randomUUID()}` });
	const handle = await open(temporary, "wx");
	try { await handle.writeFile(serialized, "utf8"); }
	finally { await handle.close(); }
	try { await link(temporary, file); }
	finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

function heartbeatSerialized(processStartedAt: string) {
	return `${JSON.stringify({ schema: "newsroom-project-mutation-instance-v1", pid: process.pid, processInstanceId: PROCESS_INSTANCE_ID, processStartedAt, heartbeatAt: new Date().toISOString() })}\n`;
}

async function retainInstanceHeartbeat({ lockPath, intervalMs = HEARTBEAT_INTERVAL_MS, faultHooks }: { lockPath: string; intervalMs?: number; faultHooks?: AcquireFaultHooks }) {
	const heartbeatPath = heartbeatPathFor({ lockPath, processInstanceId: PROCESS_INSTANCE_ID });
	const existing = heartbeatLeases.get(heartbeatPath);
	if (existing) { existing.references += 1; await existing.ready; return heartbeatPath; }
	const processStartedAt = await ownProcessStartedAt({ beforeLookup: faultHooks?.beforeOwnProcessIdentityLookup });
	const lease: HeartbeatLease = { references: 1, ready: Promise.resolve(), lastError: null };
	lease.ready = publishExclusive({ file: heartbeatPath, serialized: heartbeatSerialized(processStartedAt) }).catch(async (cause) => {
		const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
		if (code !== "EEXIST") throw cause;
		const existingHeartbeat = await observe(heartbeatPath);
		if (existingHeartbeat.record.pid !== process.pid || existingHeartbeat.record.processInstanceId !== PROCESS_INSTANCE_ID || existingHeartbeat.record.processStartedAt !== processStartedAt) throw cause;
	});
	heartbeatLeases.set(heartbeatPath, lease);
	try { await lease.ready; }
	catch (cause) { if (heartbeatLeases.get(heartbeatPath) === lease) heartbeatLeases.delete(heartbeatPath); throw cause; }
	lease.timer = setInterval(() => {
		const now = new Date();
		void utimes(heartbeatPath, now, now).then(() => { lease.lastError = null; }).catch((error) => { lease.lastError = error; });
	}, Math.max(25, intervalMs));
	lease.timer.unref();
	return heartbeatPath;
}

async function releaseInstanceHeartbeat({ heartbeatPath, faultHooks }: { heartbeatPath: string; faultHooks?: AcquireFaultHooks }) {
	const lease = heartbeatLeases.get(heartbeatPath);
	if (!lease) return;
	lease.references = Math.max(0, lease.references - 1);
	if (lease.references > 0) return;
	let observed: Observation;
	await faultHooks?.beforeHeartbeatCleanupObserve?.(heartbeatPath);
	try { observed = await observe(heartbeatPath); }
	catch (cause) {
		const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
		if (code !== "ENOENT") throw cause;
		if (lease.timer) clearInterval(lease.timer); heartbeatLeases.delete(heartbeatPath); return;
	}
	if (observed.record.processInstanceId === PROCESS_INSTANCE_ID && observed.record.pid === process.pid && observed.record.processStartedAt === await ownProcessStartedAt()) {
		if (!(await quarantineObserved({ file: heartbeatPath, observed, faultHooks }))) throw new Error("Project mutation heartbeat cleanup was not confirmed");
	}
	else throw new Error("Project mutation heartbeat cleanup lost exact process-instance fencing");
	if (lease.timer) clearInterval(lease.timer); heartbeatLeases.delete(heartbeatPath);
}

function assertHeartbeatHealthy(heartbeatPath: string) {
	const error = heartbeatLeases.get(heartbeatPath)?.lastError;
	if (error) throw new Error(`Project mutation process heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
}

async function observationIsAbandoned({ file, observed }: { file: string; observed: Observation }) {
	let tombstone: Observation;
	try { tombstone = await observe(abandonmentPathFor({ file, observed })); } catch { return false; }
	const record = tombstone.record;
	return record.token === observed.record.token
		&& record.processInstanceId === observed.record.processInstanceId
		&& record.lockIdentity === observationIdentity(observed)
		&& record.lockRawHash === createHash("sha256").update(observed.raw).digest("hex");
}

async function publishAbandonment({ file, observed }: { file: string; observed: Observation }) {
	const tombstonePath = abandonmentPathFor({ file, observed });
	const serialized = `${JSON.stringify({ schema: "newsroom-project-mutation-abandonment-v1", token: observed.record.token, pid: process.pid, processInstanceId: observed.record.processInstanceId, processStartedAt: observed.record.processStartedAt, lockIdentity: observationIdentity(observed), lockRawHash: createHash("sha256").update(observed.raw).digest("hex"), abandonedAt: new Date().toISOString() })}\n`;
	try { await publishExclusive({ file: tombstonePath, serialized }); }
	catch (cause) {
		const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
		if (code !== "EEXIST") throw cause;
		if (!(await observationIsAbandoned({ file, observed }))) throw new Error("Project mutation abandonment publication conflicted");
	}
}

async function publishAbandonmentIfStillOwned({ file, observed }: { file: string; observed: Observation }) {
	let current: Observation;
	try { current = await observe(file); } catch { return false; }
	if (!sameObservation({ left: current, right: observed })) return false;
	await publishAbandonment({ file, observed: current });
	return true;
}

async function recordIsActive({ file, observed, identityLookup = lookupProcessIdentity }: { file: string; observed: Observation; identityLookup?: (pid: number) => Promise<ProcessIdentity> }) {
	const { record } = observed;
	const pid = Number(record.pid); const token = typeof record.token === "string" ? record.token : "";
	if (!token || await observationIsAbandoned({ file, observed })) return false;
	if (!Number.isInteger(pid) || pid < 1 || !processIsAlive(pid)) return false;
	if (record.processInstanceId === PROCESS_INSTANCE_ID) return activeTokens.has(token);
	if (typeof record.processInstanceId !== "string" || typeof record.processStartedAt !== "string") return true;
	const identity = await identityLookup(pid);
	if (identity.state === "dead") return false;
	if (identity.state === "unknown") return true;
	return identity.startedAt === record.processStartedAt;
}

async function quarantineObserved({ file, observed, faultHooks, fence }: { file: string; observed: Observation; faultHooks?: AcquireFaultHooks; fence?: () => Promise<void> }) {
	const identity = observationIdentity(observed).slice(0, 24);
	const quarantinePath = siblingPath({ lockPath: file, suffix: `quarantine-${identity}-${randomUUID()}` });
	await faultHooks?.beforeQuarantineRename?.(file);
	if (fence) await fence();
	let immediatelyBeforeRename: Observation;
	try { immediatelyBeforeRename = await observe(file); }
	catch (cause) {
		const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
		if (code === "ENOENT") return false;
		throw cause;
	}
	if (!sameObservation({ left: observed, right: immediatelyBeforeRename })) return false;
	try { await rename(file, quarantinePath); }
	catch (cause) {
		const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
		if (code === "ENOENT") return false;
		throw cause;
	}
	const quarantined = await observe(quarantinePath);
	if (!sameObservation({ left: observed, right: quarantined })) {
		try { await rename(quarantinePath, file); } catch { /* a newer owner exists; preserve quarantine */ }
		return false;
	}
	await rm(quarantinePath, { force: true });
	await rm(abandonmentPathFor({ file, observed }), { force: true }).catch(() => undefined);
	return true;
}

async function waitForGate({ lockPath, waitMs = GATE_WAIT_MS, faultHooks }: { lockPath: string; waitMs?: number; faultHooks?: AcquireFaultHooks }) {
	const gatePath = siblingPath({ lockPath, suffix: "takeover" });
	const deadline = Date.now() + waitMs;
	while (Date.now() <= deadline) {
		let gate: Observation;
		try { gate = await observe(gatePath); }
		catch (cause) {
			const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
			if (code === "ENOENT") return true;
			throw cause;
		}
		const recordIsYoung = Date.now() - gate.mtimeMs < PARTIAL_GRACE_MS;
		if (await recordIsActive({ file: gatePath, observed: gate, identityLookup: faultHooks?.lookupProcessIdentity }) || (recordIsYoung && !recordIsAbandonedSameInstance(gate.record) && !(await observationIsAbandoned({ file: gatePath, observed: gate })))) {
			await new Promise((resolve) => setTimeout(resolve, 25));
			continue;
		}
		await quarantineObserved({ file: gatePath, observed: gate });
	}
	return false;
}

async function takeoverObservedLock({ lockPath, observed, allowLiveOwner, faultHooks }: { lockPath: string; observed: Observation; allowLiveOwner: boolean; faultHooks?: AcquireFaultHooks }) {
	const takeoverPath = siblingPath({ lockPath, suffix: "takeover" });
	if (!(await waitForGate({ lockPath, faultHooks }))) return false;
	const takeoverToken = randomUUID();
	activeTokens.add(takeoverToken);
	try {
		await publishExclusive({ file: takeoverPath, serialized: `${JSON.stringify({ schema: "newsroom-project-lock-takeover-v1", token: takeoverToken, pid: process.pid, processInstanceId: PROCESS_INSTANCE_ID, processStartedAt: await ownProcessStartedAt(), observedToken: observed.record.token, expiresAt: new Date(Date.now() + 30_000).toISOString() })}\n` });
	} catch (cause) {
		activeTokens.delete(takeoverToken);
		const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
		if (code === "EEXIST") return false;
		throw cause;
	}
	let operationCompleted = false; let operationError: unknown = null; let ownedGate: Observation | null = null;
	try {
		ownedGate = await observe(takeoverPath);
		if (ownedGate.record.token !== takeoverToken) throw new Error("Project mutation takeover fencing was lost before main mutation");
		const current = await observe(lockPath);
		if (!sameObservation({ left: current, right: observed })) throw new Error("Project mutation main lock changed before quarantine");
		if (!allowLiveOwner && await recordIsActive({ file: lockPath, observed: current, identityLookup: faultHooks?.lookupProcessIdentity })) operationCompleted = false;
		else {
			await faultHooks?.beforeMainQuarantine?.(lockPath);
			operationCompleted = await quarantineObserved({ file: lockPath, observed: current, faultHooks, fence: async () => {
				const [gateNow, mainNow] = await Promise.all([observe(takeoverPath), observe(lockPath)]);
				if (gateNow.record.token !== takeoverToken || !ownedGate || !sameObservation({ left: gateNow, right: ownedGate })) throw new Error("Project mutation takeover fencing was lost before main quarantine");
				if (!sameObservation({ left: mainNow, right: observed })) throw new Error("Project mutation main-owner fencing was lost before quarantine");
			} });
		}
	} catch (cause) {
		const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
		if (code !== "ENOENT") operationError = cause;
	}
	let gateCleanupError: unknown = null;
	try {
		const gate = await observe(takeoverPath);
		if (gate.record.token !== takeoverToken) throw new Error(`Project mutation takeover gate ownership was lost${operationCompleted ? " after main mutation" : ""}`);
		if (!(await quarantineObserved({ file: takeoverPath, observed: gate, faultHooks }))) throw new Error("Project mutation takeover gate cleanup was not confirmed");
	} catch (cause) { gateCleanupError = cause; }
	activeTokens.delete(takeoverToken);
	if (gateCleanupError) {
		let abandonmentError: unknown = null;
		if (ownedGate) { try { await publishAbandonmentIfStillOwned({ file: takeoverPath, observed: ownedGate }); } catch (cause) { abandonmentError = cause; } }
		if (abandonmentError) throw new AggregateError([gateCleanupError, abandonmentError], "Project mutation takeover cleanup and abandonment publication failed");
		throw gateCleanupError;
	}
	if (operationError) throw operationError;
	return operationCompleted;
}

async function abandonOwnPublishedLock(lock: Omit<ProjectMutationLock, "heartbeatPath">) {
	const current = await observe(lock.lockPath);
	if (current.record.token !== lock.token || current.raw !== lock.ownerRaw || (lock.ownerIno !== 0 && current.ino !== lock.ownerIno)) throw new Error("Project mutation own-lock cleanup lost fencing");
	if (!(await quarantineObserved({ file: lock.lockPath, observed: current, faultHooks: lock.faultHooks }))) throw new Error("Project mutation own-lock cleanup was not confirmed");
}

async function scavengeOldArtifacts(lockPath: string) {
	const parent = path.dirname(lockPath); const base = path.basename(lockPath);
	const names = await readdir(parent);
	for (const name of names) {
		const isHeartbeat = name.startsWith(`${base}.instance-`) && name.includes(".heartbeat");
		const isAbandonment = name.startsWith(`${base}.abandoned-`) || name.startsWith(`${base}.takeover.abandoned-`);
		if (!name.startsWith(`${base}.publish-`) && !name.startsWith(`${base}.quarantine-`) && !isHeartbeat && !isAbandonment) continue;
		const file = siblingPath({ lockPath, suffix: name.slice(base.length + 1) });
		let artifact: Observation;
		try { artifact = await observe(file); } catch { continue; }
		if (!artifact.parsed) continue;
		if (isHeartbeat) {
			const pid = Number(artifact.record.pid);
			if (processIsAlive(pid)) {
				if (Date.now() - artifact.mtimeMs < ARTIFACT_GRACE_MS) continue;
				if (typeof artifact.record.processStartedAt !== "string") continue;
				const identity = await lookupProcessIdentity(pid);
				if (identity.state === "unknown" || (identity.state === "alive" && identity.startedAt === artifact.record.processStartedAt)) continue;
			}
			await quarantineObserved({ file, observed: artifact }); continue;
		}
		if (isAbandonment) {
			if (Date.now() - artifact.mtimeMs < ARTIFACT_GRACE_MS) continue;
			const target = name.startsWith(`${base}.takeover.abandoned-`) ? `${lockPath}.takeover` : lockPath;
			let stillBound = false;
			try { stillBound = artifact.record.lockIdentity === observationIdentity(await observe(target)); } catch { /* orphan tombstone */ }
			if (!stillBound) await quarantineObserved({ file, observed: artifact });
			continue;
		}
		if (Date.now() - artifact.mtimeMs < ARTIFACT_GRACE_MS || await recordIsActive({ file, observed: artifact })) continue;
		await quarantineObserved({ file, observed: artifact });
	}
}

export async function acquireProjectMutationLock({ workflowFile, leaseMs = 30 * 60_000, faultHooks }: { workflowFile: string; leaseMs?: number; faultHooks?: AcquireFaultHooks }): Promise<ProjectMutationLock> {
	const lockPath = `${path.resolve(workflowFile)}.mutation.lock`;
	const gateWaitMs = faultHooks?.gateWaitMs ?? GATE_WAIT_MS;
	await mkdir(path.dirname(lockPath), { recursive: true });
	const heartbeatPath = await retainInstanceHeartbeat({ lockPath, intervalMs: faultHooks?.heartbeatIntervalMs, faultHooks });
	try {
	await scavengeOldArtifacts(lockPath);
	for (let attempt = 0; attempt < 64; attempt += 1) {
		if (!(await waitForGate({ lockPath, waitMs: gateWaitMs, faultHooks }))) throw new Error("Project mutation takeover did not settle");
		await faultHooks?.afterGatePrecheck?.(lockPath);
		const token = randomUUID();
		activeTokens.add(token);
		let published = false; let ownedMain: Observation | null = null;
		try {
			await publishExclusive({ file: lockPath, serialized: `${JSON.stringify({ schema: "newsroom-project-mutation-lock-v1", token, pid: process.pid, processInstanceId: PROCESS_INSTANCE_ID, processStartedAt: await ownProcessStartedAt(), acquiredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + leaseMs).toISOString() })}\n` });
			published = true;
			ownedMain = await observe(lockPath);
			if (ownedMain.record.token !== token) throw new Error("Project mutation main-lock publication lost fencing");
			await faultHooks?.afterMainPublish?.(lockPath);
			if (!(await waitForGate({ lockPath, waitMs: gateWaitMs, faultHooks }))) throw new Error("Project mutation takeover did not settle");
			const current = await observe(lockPath);
			if (current.record.token !== token || !sameObservation({ left: current, right: ownedMain })) throw new Error("Project mutation main-owner fencing was lost before critical section");
			assertHeartbeatHealthy(heartbeatPath);
			return { lockPath, token, ownerRaw: ownedMain.raw, ownerIno: ownedMain.ino, heartbeatPath, faultHooks };
		} catch (cause) {
			const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
			if (code !== "EEXIST") {
				let cleanupError: unknown = null;
				if (published && ownedMain) {
					try { await abandonOwnPublishedLock({ lockPath, token, ownerRaw: ownedMain.raw, ownerIno: ownedMain.ino, faultHooks }); }
					catch (error) { cleanupError = error; }
				}
				activeTokens.delete(token);
				if (cleanupError && ownedMain) {
					let abandonmentError: unknown = null;
					try { await publishAbandonmentIfStillOwned({ file: lockPath, observed: ownedMain }); } catch (error) { abandonmentError = error; }
					if (abandonmentError) throw new AggregateError([cause, cleanupError, abandonmentError], "Project mutation acquire cleanup and abandonment publication failed");
					throw new AggregateError([cause, cleanupError], `Project mutation acquire failed and own-token cleanup was not confirmed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
				}
				throw cause;
			}
			activeTokens.delete(token);
			let current: Observation;
			try { current = await observe(lockPath); }
			catch { continue; }
			if (await recordIsActive({ file: lockPath, observed: current, identityLookup: faultHooks?.lookupProcessIdentity })) throw new Error("Project mutation is already in progress; retry this operation");
			if (Date.now() - current.mtimeMs < PARTIAL_GRACE_MS && !recordIsAbandonedSameInstance(current.record) && !(await observationIsAbandoned({ file: lockPath, observed: current }))) {
				await new Promise((resolve) => setTimeout(resolve, 25));
				continue;
			}
			await takeoverObservedLock({ lockPath, observed: current, allowLiveOwner: false, faultHooks });
			await new Promise((resolve) => setTimeout(resolve, 5 + attempt % 7));
		}
	}
	throw new Error("Could not acquire project mutation lock");
	} catch (cause) {
		try { await releaseInstanceHeartbeat({ heartbeatPath, faultHooks }); }
		catch (heartbeatError) { throw new AggregateError([cause, heartbeatError], "Project mutation acquire failed and heartbeat cleanup was not confirmed"); }
		throw cause;
	}
}

export async function releaseProjectMutationLock(lock: ProjectMutationLock) {
	let lastError: unknown = null;
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			assertHeartbeatHealthy(lock.heartbeatPath);
			const current = await observe(lock.lockPath);
			if (current.record.token !== lock.token || current.raw !== lock.ownerRaw || (lock.ownerIno !== 0 && current.ino !== lock.ownerIno)) throw new Error("Project mutation main-owner fencing was lost during release");
			if (await takeoverObservedLock({ lockPath: lock.lockPath, observed: current, allowLiveOwner: true, faultHooks: lock.faultHooks })) { activeTokens.delete(lock.token); await releaseInstanceHeartbeat({ heartbeatPath: lock.heartbeatPath, faultHooks: lock.faultHooks }); return; }
			await new Promise((resolve) => setTimeout(resolve, 25));
		} catch (cause) {
			lastError ??= cause;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	activeTokens.delete(lock.token);
	let abandonmentError: unknown = null; let heartbeatError: unknown = null;
	try {
		const current = await observe(lock.lockPath);
		if (current.record.token === lock.token && current.raw === lock.ownerRaw && (lock.ownerIno === 0 || current.ino === lock.ownerIno)) await publishAbandonment({ file: lock.lockPath, observed: current });
	} catch (cause) { abandonmentError = cause; }
	try { await releaseInstanceHeartbeat({ heartbeatPath: lock.heartbeatPath, faultHooks: lock.faultHooks }); } catch (cause) { heartbeatError = cause; }
	const releaseError = lastError instanceof Error ? lastError : new Error("Project mutation lock release was not confirmed");
	if (abandonmentError || heartbeatError) {
		const cleanupDetail = heartbeatError instanceof Error ? heartbeatError.message : abandonmentError instanceof Error ? abandonmentError.message : "unknown cleanup error";
		throw new AggregateError([releaseError, abandonmentError, heartbeatError].filter(Boolean), `Project mutation release and abandonment cleanup failed: ${cleanupDetail}`);
	}
	throw releaseError;
}
