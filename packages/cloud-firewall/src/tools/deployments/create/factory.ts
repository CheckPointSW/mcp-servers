import { z } from 'zod';
import {
    defineTool,
    jsonResult,
    type AnyToolDef,
    type Problem,
} from '../../types.js';
import { type CpcfVendor } from '../../../clients/cpcf.js';
import { effectiveConfiguration } from './effective-config.js';
import { NO_GUIDE_FALLBACK } from '../guide.js';
import { asynchronousObservationGuidance } from '../../../instructions.js';

/**
 * Infer from the same composed shape passed to defineTool. Zod 4's object
 * output inference does not distribute over intersections of raw shapes. A
 * precheck declares the structural subset it reads, so a check written
 * against `{ managementSettings?: ... }` composes here without casts.
 */
type CreateShape<Top extends z.ZodRawShape> = Top & {
    vendorSettings: z.ZodTypeAny;
};
type CreateArgs<Top extends z.ZodRawShape> = z.infer<
    z.ZodObject<CreateShape<Top>>
>;

/**
 * Factory for create_deployment_<vendor>. Everything genuinely
 * vendor-independent — the tool name pattern, the carefully worded
 * approval and preview description, tier 2, input validation
 * (local request rules) and the create handler — exists
 * once here, so a second vendor cannot copy-paste it and let it drift.
 *
 * What a vendor supplies is everything a backend create contract can
 * genuinely disagree about: its top-level field shape, its vendorSettings
 * schema, both halves of the preview sentence, and its local prechecks. The
 * factory deliberately holds no field names of its own — an earlier version
 * spread one "common" schema and interpolated fixed fields into the preview,
 * which would silently offer a differently-shaped cloud fields its endpoint
 * rejects.
 */
export function makeCreateDeploymentTool<
    // Generic over the cloud's top-level shape so defineTool can infer the
    // argument type. Annotating topLevelSchema as a bare ZodRawShape widens it
    // and the handler sees `{}` — the same trap defineTool and defineProfile
    // exist to avoid.
    Top extends z.ZodRawShape & { name: z.ZodString },
>(opts: {
    /** Create-endpoint path segment AND tool-name suffix. Compile-time literal. */
    vendor: CpcfVendor;
    /** Human label used in the description and preview, e.g. 'AWS'. */
    vendorLabel: string;
    /** Read-only provider lookup steps, visible before the parameter schema. */
    discoveryGuidance: string;
    vendorSettingsSchema: z.ZodTypeAny;
    /**
     * The cloud's top-level create fields — everything except vendorSettings,
     * composed from the profiles that cloud actually shares.
     *
     * Supplied per cloud rather than spreading a single "common" shape here.
     * A cloud whose backend contract genuinely differs (no throughput/plan,
     * a different management block) must not have those fields offered to
     * the model as though its endpoint accepted them.
     */
    topLevelSchema: Top;
    /**
     * The vendor-specific middle of the preview sentence, e.g.
     * `in eu-west-1 protecting account 123456789012`. Renders text a user
     * approves — read fields defensively, never include secrets.
     */
    vendorClause: (vendorSettings: Record<string, unknown>) => string;
    /**
     * The product half of the preview sentence — everything between the
     * vendor clause and the closing "Approving starts provisioning ..." line, e.g.
     * `NGTP plan, 25 Gbps, gateway R82, self-hosted management`.
     *
     * Supplied per cloud rather than hardcoded here, because the fields
     * differ per cloud (see cpProductClause). Interpolating absent fields
     * would print "undefined plan, undefined Gbps" into the text a user
     * approves.
     */
    productClause: (args: CreateArgs<Top>) => string;
    /**
     * Local prechecks for this cloud, in the order they should report.
     *
     * Supplied per cloud rather than hardcoded, because the management
     * contract itself is per-cloud: some clouds pass managementPrecheck,
     * others pass their own rules. All of them run — the Problem[]
     * convention is one repair cycle, not one problem per call.
     */
    localPrechecks?: Array<(args: CreateArgs<Top>) => Problem[]>;
    /**
     * Optional cloud-specific text appended to the post-create `next` message,
     * e.g. a pointer to a tool this server exposes for the cloud's
     * post-deployment step. Keep it to stable references; do not restate
     * backend flow steps here, they drift when the backend changes.
     */
    postCreateGuidance?: string;
    /**
     * Public (sc1) deployment guide for this cloud. When set, it replaces the
     * NO_GUIDE_FALLBACK placeholder (Infinity Portal getting-started page) and is appended after
     * postCreateGuidance, so this server's tools are offered before the guide.
     */
    deploymentGuideUrl?: string;
}): AnyToolDef {
    const { vendor, vendorLabel } = opts;
    const createShape: CreateShape<Top> = {
        ...opts.topLevelSchema,
        vendorSettings: opts.vendorSettingsSchema,
    };
    return defineTool({
        name: `create_deployment_${vendor}`,
        description: `Create ${vendorLabel} Cloud Firewall. Preview with confirm: false; never provisions and needs no separate user approval. Show willDo, approvalPreview verbatim and warnings. Provision only after explicit preview approval, using confirm: true with its confirmToken and unchanged inputs. Backend validation/provisioning can fail; acceptance is not readiness. Never invent secrets or billable choices. ${opts.discoveryGuidance}`,
        tier: 2,
        schema: createShape,
        precheck: async (args) =>
            // Local input checks only; there is no backend preflight here.
            // An accepted create can still fail during asynchronous provisioning.
            (opts.localPrechecks ?? []).flatMap((check) => check(args)),
        previewSummary: (args) => {
            // The sentence a user approves, in money and blast-radius terms.
            // Both variable halves come from the cloud: vendorClause names
            // where it lands, productClause what is being bought.
            // Zod 4 cannot expose fixed keys while Top is still generic.
            // The name constraint and composed shape guarantee these keys;
            // keep the full inferred args for the typed product/precheck callbacks.
            const { name, vendorSettings } = args as {
                name: string;
                vendorSettings?: unknown;
            };
            return `Create ${vendorLabel} deployment "${name}" ${opts.vendorClause((vendorSettings ?? {}) as Record<string, unknown>)}: ${opts.productClause(args)}. Approving starts provisioning of ${vendorLabel} resources, which may incur charges.`;
        },
        // The sentence alone hides every omitted optional field; the user
        // must see what will actually apply (defaults included) before
        // approving. Walks the same shape the tool advertises, so a field
        // added to a cloud's schema appears here without further wiring.
        previewConfiguration: (args) =>
            effectiveConfiguration(
                createShape,
                args as unknown as Record<string, unknown>
            ),
        handler: async (args, ctx) => {
            // args is zod-parsed (unknown keys stripped) and the registry has
            // already removed confirm/confirmToken, so it is the create body.
            const result = await ctx.api.cpcf.createDeployment(vendor, args);
            return jsonResult({
                created: true,
                id: result.id,
                next: `The backend accepted provisioning. Read deployment_status with id ${result.id}; report status, error and deletionStatus as returned. ${asynchronousObservationGuidance} Acceptance does not establish completion or traffic protection. Connectivity, routing and management setup remain the customer's responsibility.${opts.postCreateGuidance ? ` ${opts.postCreateGuidance}` : ''}${opts.deploymentGuideUrl ? ` When setup documentation is needed, use get_deployment_guide with vendor ${vendor} and deploymentId ${result.id}: ${opts.deploymentGuideUrl}` : ` ${NO_GUIDE_FALLBACK}`}`,
            });
        },
    });
}
