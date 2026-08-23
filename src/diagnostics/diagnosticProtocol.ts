export const DIAGNOSTIC_RESULT_SCHEMA = "lumeria-diagnostic-result/v1" as const;
export const DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA = "lumeria-diagnostic-artifact-delivery/v1" as const;
export const DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA = "lumeria-diagnostic-artifact-reference/v1" as const;
export const DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA = "lumeria-diagnostic-artifact-page/v1" as const;

export type DiagnosticParams = Readonly<Record<string, unknown>>;
export type DiagnosticArtifactPath = readonly (string | number)[];
export type DiagnosticResultSize = "small" | "medium" | "large";
export type DiagnosticArtifactRepresentation = "structured" | "json" | "text";

export interface DiagnosticOperationDescriptor {
  readonly id: string;
  readonly mutatesState: boolean;
  readonly paramsSchema?: unknown;
  readonly resultSize: DiagnosticResultSize;
  readonly title?: string;
  readonly titleKey?: string;
}

export interface DiagnosticToolDescriptor {
  readonly description?: string;
  readonly descriptionKey?: string;
  readonly id: string;
  readonly locale?: string;
  readonly operations: readonly DiagnosticOperationDescriptor[];
  readonly title?: string;
  readonly titleKey?: string;
  readonly version: number;
}

export interface DiagnosticInvocationContext {
  readonly generatedAt: string;
  readonly requestId: string;
  readonly toolId: string;
}

export interface DiagnosticAdapter {
  describe(): DiagnosticToolDescriptor & Readonly<Record<string, unknown>>;
  dispose(): unknown | Promise<unknown>;
  getStatus(): unknown | Promise<unknown>;
  invoke(
    operation: string,
    params?: unknown,
    context?: DiagnosticInvocationContext,
  ): unknown | Promise<unknown>;
}

export interface DiagnosticErrorPayload {
  readonly code: string;
  readonly details: unknown;
  readonly message: string;
  readonly nextActions: readonly string[];
}

interface DiagnosticResultBase {
  readonly generatedAt: string;
  readonly operation: string;
  readonly requestId: string;
  readonly schema: typeof DIAGNOSTIC_RESULT_SCHEMA;
  readonly toolId: string | null;
}

export type DiagnosticResult<Data = unknown> =
  | (DiagnosticResultBase & Readonly<{ data: Data; ok: true }>)
  | (DiagnosticResultBase & Readonly<{ error: DiagnosticErrorPayload; ok: false }>);

export interface DiagnosticArtifactSource {
  readonly operation: string | null;
  readonly requestId: string | null;
  readonly toolId: string | null;
}

export interface DiagnosticValueSummary {
  readonly fieldCount?: number;
  readonly kind: string;
  readonly length?: number;
  readonly preview?: string;
  readonly value?: unknown;
}

export interface DiagnosticArtifactReference {
  readonly artifactId: string;
  readonly byteLength?: number;
  readonly createdAt?: string;
  readonly mediaType?: string;
  readonly query?: Readonly<{
    defaultPageLimit: number;
    maxPageBytes: number;
    maxPageLimit: number;
    maxTextPageChars: number;
    representations: readonly DiagnosticArtifactRepresentation[];
  }>;
  readonly root?: DiagnosticValueSummary;
  readonly schema: typeof DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA;
  readonly source?: DiagnosticArtifactSource;
}

export interface DiagnosticArtifactDelivery {
  readonly artifact: DiagnosticArtifactReference;
  readonly delivery: "artifact";
  readonly schema: typeof DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA;
}

export interface DiagnosticArtifactPageInfo {
  readonly hasMore: boolean;
  readonly limit: number;
  readonly nextOffset: number;
  readonly offset: number;
  readonly returned: number;
  readonly total: number;
}

export interface DiagnosticArtifactQueryRequest {
  readonly artifactId?: unknown;
  readonly limit?: unknown;
  readonly mode?: unknown;
  readonly offset?: unknown;
  readonly path?: unknown;
  readonly representation?: unknown;
  readonly requestId?: unknown;
}

export interface DiagnosticArtifactPage {
  readonly artifactId: string;
  readonly fields?: readonly unknown[];
  readonly items?: readonly unknown[];
  readonly kind: string;
  readonly page?: DiagnosticArtifactPageInfo;
  readonly path: DiagnosticArtifactPath;
  readonly representation: DiagnosticArtifactRepresentation;
  readonly schema: typeof DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA;
  readonly text?: string;
  readonly value?: unknown;
}

export interface DiagnosticArtifactStore {
  create(value: unknown, metadata?: unknown): DiagnosticArtifactReference | Promise<DiagnosticArtifactReference>;
  dispose(): unknown | Promise<unknown>;
  query(request?: DiagnosticArtifactQueryRequest): DiagnosticArtifactPage | Promise<DiagnosticArtifactPage>;
  release(artifactId: unknown): unknown | Promise<unknown>;
}
